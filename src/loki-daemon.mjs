import { createServer } from "node:http";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const providerId = "loki.chrome";
const serviceId = "loki.chrome_daemon";
const defaultStateDir = join(repoRoot, "state");

function parseArgs(argv) {
  const config = {
    host: process.env.LOKI_CHROME_HOST ?? "127.0.0.1",
    port: Number(process.env.LOKI_CHROME_PORT ?? 9222),
    extensionHost: process.env.LOKI_EXTENSION_HOST ?? "127.0.0.1",
    extensionPort: Number(process.env.LOKI_EXTENSION_PORT ?? 17666),
    intervalMs: Number(process.env.LOKI_INTERVAL_MS ?? 5000),
    stateDir: process.env.LOKI_STATE_DIR ?? defaultStateDir,
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") config.once = true;
    else if (arg === "--host") config.host = argv[++index] ?? config.host;
    else if (arg === "--port") config.port = Number(argv[++index] ?? config.port);
    else if (arg === "--extension-host") config.extensionHost = argv[++index] ?? config.extensionHost;
    else if (arg === "--extension-port") config.extensionPort = Number(argv[++index] ?? config.extensionPort);
    else if (arg === "--interval-ms") config.intervalMs = Number(argv[++index] ?? config.intervalMs);
    else if (arg === "--state-dir") config.stateDir = argv[++index] ?? config.stateDir;
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error(`Invalid --port: ${config.port}`);
  }
  if (!Number.isFinite(config.intervalMs) || config.intervalMs < 1000) {
    throw new Error(`Invalid --interval-ms: ${config.intervalMs}`);
  }
  if (!Number.isFinite(config.extensionPort) || config.extensionPort <= 0) {
    throw new Error(`Invalid --extension-port: ${config.extensionPort}`);
  }
  return config;
}

function printHelp() {
  console.log(`Loki Chrome CultMesh daemon

Usage:
  node src/loki-daemon.mjs [--once] [--host 127.0.0.1] [--port 9222]
                           [--extension-host 127.0.0.1] [--extension-port 17666]
                           [--interval-ms 5000] [--state-dir state]
`);
}

async function fetchJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function observeChrome(config) {
  const baseUrl = `http://${config.host}:${config.port}`;
  const observedAt = new Date().toISOString();

  try {
    const [version, targets] = await Promise.all([
      fetchJson(`${baseUrl}/json/version`),
      fetchJson(`${baseUrl}/json/list`),
    ]);

    const tabs = Array.isArray(targets)
      ? targets
          .filter((target) => target.type === "page")
          .map(normalizeTab)
          .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
      : [];

    return {
      source: "cdp",
      observedAt,
      freshness: {
        state: "fresh",
        lastSeenAt: observedAt,
        maxAgeMs: config.intervalMs * 3,
      },
      authority: "external-authority-projection",
      cdp: {
        endpoint: baseUrl,
        reachable: true,
        browser: stringOrNull(version.Browser),
        protocolVersion: stringOrNull(version["Protocol-Version"]),
        userAgent: stringOrNull(version["User-Agent"]),
        webSocketDebuggerUrl: stringOrNull(version.webSocketDebuggerUrl),
      },
      tabs,
    };
  } catch (error) {
    return {
      source: "cdp",
      observedAt,
      freshness: {
        state: "unreachable",
        lastSeenAt: null,
        maxAgeMs: config.intervalMs * 3,
      },
      cdp: {
        endpoint: baseUrl,
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
      },
      tabs: [],
    };
  }
}

function normalizeExtensionObservation(payload, config) {
  const observedAt = new Date().toISOString();
  if (!payload || payload.schema !== "gamecult.loki.chrome_extension_report.v0") {
    throw new Error("Unsupported extension report schema");
  }

  const tabs = Array.isArray(payload.tabs)
    ? payload.tabs.map(normalizeExtensionTab).sort((left, right) => Number(right.active) - Number(left.active) || left.index - right.index)
    : [];

  return {
    source: "chrome-extension",
    observedAt,
    extension: {
      reachable: true,
      extensionVersion: stringOrNull(payload.extensionVersion),
      browser: stringOrNull(payload.browser),
      receivedAt: observedAt,
      lastReportAt: stringOrNull(payload.reportedAt),
      ingestEndpoint: `http://${config.extensionHost}:${config.extensionPort}/ingest/chrome-extension`,
    },
    freshness: {
      state: "fresh",
      lastSeenAt: observedAt,
      maxAgeMs: config.intervalMs * 3,
    },
    debugProbe: normalizeDebugProbe(payload.debugProbe),
    pageSnapshot: normalizePageSnapshot(payload.pageSnapshot),
    tabs,
  };
}

function normalizeDebugProbe(debugProbe) {
  if (!debugProbe || debugProbe.schema !== "gamecult.loki.chrome_debug_probe.v0") return null;
  return {
    ...debugProbe,
    providerId,
    serviceId,
    ingestedAt: new Date().toISOString(),
  };
}

function normalizePageSnapshot(pageSnapshot) {
  if (!pageSnapshot || pageSnapshot.schema !== "gamecult.loki.chrome_page_snapshot.v0") return null;
  return {
    ...pageSnapshot,
    providerId,
    serviceId,
    ingestedAt: new Date().toISOString(),
  };
}

function normalizeExtensionTab(tab) {
  return {
    id: String(tab.id ?? ""),
    windowId: numberOrNull(tab.windowId),
    index: Number.isFinite(tab.index) ? tab.index : 0,
    active: Boolean(tab.active),
    highlighted: Boolean(tab.highlighted),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    muted: Boolean(tab.muted),
    incognito: Boolean(tab.incognito),
    title: stringOrNull(tab.title),
    url: stringOrNull(tab.url),
    type: "page",
    faviconUrl: stringOrNull(tab.favIconUrl),
    devtoolsFrontendUrl: null,
    webSocketDebuggerUrl: null,
    attached: false,
    canInspect: false,
    source: "chrome-extension",
  };
}

function buildSnapshot(config, cdpObservation, extensionObservation) {
  const observedAt = new Date().toISOString();
  const activeObservation = chooseActiveObservation(cdpObservation, extensionObservation);
  const tabs = activeObservation?.tabs ?? [];
  const cdp = cdpObservation?.cdp ?? {
    endpoint: `http://${config.host}:${config.port}`,
    reachable: false,
    error: "not-observed",
  };
  const extension = extensionObservation?.extension ?? {
    reachable: false,
    ingestEndpoint: `http://${config.extensionHost}:${config.extensionPort}/ingest/chrome-extension`,
    error: "no extension report received",
  };

  const sourceStates = {
    cdp: cdpObservation?.freshness?.state ?? "missing",
    chromeExtension: extensionObservation?.freshness?.state ?? "missing",
  };
  const freshnessState = activeObservation ? "fresh" : "unreachable";

  return {
    schema: "gamecult.loki.chrome_snapshot.v0",
    providerId,
    serviceId,
    observedAt,
    activeSource: activeObservation?.source ?? "none",
    freshness: {
      state: freshnessState,
      lastSeenAt: activeObservation?.observedAt ?? null,
      maxAgeMs: config.intervalMs * 3,
    },
    sources: {
      cdp: {
        state: sourceStates.cdp,
        observedAt: cdpObservation?.observedAt ?? null,
      },
      chromeExtension: {
        state: sourceStates.chromeExtension,
        observedAt: extensionObservation?.observedAt ?? null,
      },
    },
    cdp,
    extension,
    debugProbe: extensionObservation?.debugProbe ?? null,
    pageSnapshot: extensionObservation?.pageSnapshot ?? null,
    tabs,
    summary: {
      tabCount: tabs.length,
      inspectableTabCount: tabs.filter((tab) => tab.webSocketDebuggerUrl).length,
      activeTabCount: tabs.filter((tab) => tab.active).length,
      debugProbeAttachedTabCount: extensionObservation?.debugProbe?.summary?.attachedTabCount ?? 0,
      debugProbeAttemptedTabCount: extensionObservation?.debugProbe?.summary?.attemptedTabCount ?? 0,
      pageSnapshotVisibleTextLength: extensionObservation?.pageSnapshot?.content?.visibleTextLength ?? 0,
      pageSnapshotFormControlCount: extensionObservation?.pageSnapshot?.forms?.controlCount ?? 0,
    },
    redaction: {
      urlQuery: activeObservation ? "preserved" : "not-observed",
      titles: activeObservation ? "preserved" : "not-observed",
      pageContent: extensionObservation?.pageSnapshot ? "explicit-active-tab-visible-text" : "not-read",
      cookies: "not-read",
      source: activeObservation?.source ?? "none",
      debugProbe: extensionObservation?.debugProbe ? extensionObservation.debugProbe.redaction : "not-run",
      pageSnapshot: extensionObservation?.pageSnapshot ? extensionObservation.pageSnapshot.redaction : "not-run",
    },
  };
}

function chooseActiveObservation(cdpObservation, extensionObservation) {
  if (extensionObservation?.freshness?.state === "fresh") return extensionObservation;
  if (cdpObservation?.freshness?.state === "fresh") return cdpObservation;
  return null;
}

function unreachableSnapshot(config, error) {
  const observedAt = new Date().toISOString();
  return {
    schema: "gamecult.loki.chrome_snapshot.v0",
    providerId,
    serviceId,
    observedAt,
    activeSource: "none",
    freshness: {
      state: "unreachable",
      lastSeenAt: null,
      maxAgeMs: config.intervalMs * 3,
    },
    sources: {
      cdp: { state: "unreachable", observedAt },
      chromeExtension: { state: "missing", observedAt: null },
    },
    cdp: {
      endpoint: `http://${config.host}:${config.port}`,
      reachable: false,
      error,
    },
    extension: {
      reachable: false,
      ingestEndpoint: `http://${config.extensionHost}:${config.extensionPort}/ingest/chrome-extension`,
      error: "no extension report received",
    },
    tabs: [],
    pageSnapshot: null,
    debugProbe: null,
    summary: {
      tabCount: 0,
      inspectableTabCount: 0,
      activeTabCount: 0,
      pageSnapshotVisibleTextLength: 0,
      pageSnapshotFormControlCount: 0,
    },
    redaction: {
      urlQuery: "not-observed",
      titles: "not-observed",
      pageContent: "not-read",
      cookies: "not-read",
      source: "none",
      pageSnapshot: "not-run",
      debugProbe: "not-run",
    },
  };
}

function normalizeTab(target) {
  return {
    id: String(target.id ?? ""),
    title: stringOrNull(target.title),
    url: stringOrNull(target.url),
    type: stringOrNull(target.type),
    faviconUrl: stringOrNull(target.faviconUrl),
    devtoolsFrontendUrl: stringOrNull(target.devtoolsFrontendUrl),
    webSocketDebuggerUrl: stringOrNull(target.webSocketDebuggerUrl),
    attached: Boolean(target.attached),
    canInspect: Boolean(target.webSocketDebuggerUrl),
  };
}

function buildProviderAdvertisement(snapshot) {
  const updatedAt = snapshot.observedAt;
  return {
    schema: "gamecult.eve.provider_advertisement.v1",
    providerId,
    serviceId,
    verseId: "loki.local",
    rootVerse: "asgard",
    canonicalService: "asgard.loki.chrome",
    locatedService: "asgard.localhost.loki.chrome",
    cultMeshAddress: "asgard.localhost.loki.chrome/eve/gui",
    title: "Loki Chrome",
    kind: "service.operator",
    updatedAt,
    freshness: snapshot.freshness,
    schemas: [
      {
        schema: "gamecult.loki.chrome_snapshot.v0",
        owner: providerId,
        authority: "observed",
        storage: "cultcache-cc",
        cultMeshAddress: "asgard.localhost.loki.chrome/state/snapshot",
        portable: true,
      },
      {
        schema: "gamecult.loki.chrome_extension_report.v0",
        owner: providerId,
        authority: "external-authority-projection",
        storage: "ingest-only",
        cultMeshAddress: "asgard.localhost.loki.chrome/ingest/chrome-extension",
        portable: true,
      },
      {
        schema: "gamecult.loki.chrome_debug_probe.v0",
        owner: providerId,
        authority: "observed",
        storage: "cultcache-cc",
        cultMeshAddress: "asgard.localhost.loki.chrome/state/debug-probe",
        portable: true,
      },
      {
        schema: "gamecult.loki.chrome_page_snapshot.v0",
        owner: providerId,
        authority: "operator-approved-observation",
        storage: "cultcache-cc",
        cultMeshAddress: "asgard.localhost.loki.chrome/state/page-snapshot",
        portable: true,
      },
      {
        schema: "gamecult.eve.surface.v1",
        owner: providerId,
        authority: "derived",
        storage: "cultcache-cc",
        cultMeshAddress: "asgard.localhost.loki.chrome/eve/gui",
        portable: true,
      },
    ],
    witnesses: [
      {
        id: "loki.chrome.snapshot",
        kind: "cc-export",
        path: "state/loki.chrome_snapshot.cc",
        schemas: ["gamecult.loki.chrome_snapshot.v0"],
        redaction: snapshot.redaction,
        freshness: {
          state: snapshot.freshness.state,
          updatedAt,
        },
      },
      {
        id: "loki.chrome.eve_surface",
        kind: "cc-export",
        path: "state/loki.eve_surface.cc",
        schemas: ["gamecult.eve.surface.v1"],
        redaction: "derived-operator-surface",
        freshness: {
          state: snapshot.freshness.state,
          updatedAt,
        },
      },
      {
        id: "loki.chrome.debug_probe",
        kind: "cc-export",
        path: "state/loki.chrome_debug_probe.cc",
        schemas: ["gamecult.loki.chrome_debug_probe.v0"],
        redaction: snapshot.debugProbe?.redaction ?? "not-run",
        freshness: {
          state: snapshot.debugProbe ? "fresh" : "missing",
          updatedAt: snapshot.debugProbe?.ingestedAt ?? null,
        },
      },
      {
        id: "loki.chrome.page_snapshot",
        kind: "cc-export",
        path: "state/loki.chrome_page_snapshot.cc",
        schemas: ["gamecult.loki.chrome_page_snapshot.v0"],
        redaction: snapshot.pageSnapshot?.redaction ?? "not-run",
        freshness: {
          state: snapshot.pageSnapshot ? "fresh" : "missing",
          updatedAt: snapshot.pageSnapshot?.ingestedAt ?? null,
        },
      },
    ],
    surfaces: [
      {
        surfaceId: "loki.chrome.operator",
        schema: "gamecult.eve.surface.v1",
        transport: "cultmesh-document",
        address: "asgard.localhost.loki.chrome/eve/gui",
        tuiAddress: "asgard.localhost.loki.chrome/eve/tui",
        audience: "operator",
        mode: "read-only",
        styleProfile: "loki.operator",
        commands: [],
      },
    ],
    commands: [],
    routes: [
      {
        kind: "local-cdp",
        address: snapshot.cdp.endpoint,
        carries: ["chrome-target-metadata"],
        note: "Requires user-launched Chrome with --remote-debugging-port.",
      },
      {
        kind: "chrome-extension-ingest",
        address: snapshot.extension.ingestEndpoint,
        carries: ["chrome-extension-tab-metadata", "explicit-active-page-snapshot"],
        note: "Preferred drop-in Chrome path; extension observes tab metadata and can run explicit operator-triggered page snapshots and chrome.debugger sweeps.",
      },
      {
        kind: "local-cultcache-witness",
        address: "state/",
        carries: [
          "state/loki.chrome_snapshot.cc",
          "state/loki.provider_advertisement.cc",
          "state/loki.eve_surface.cc",
          "state/loki.chrome_debug_probe.cc",
          "state/loki.chrome_page_snapshot.cc",
        ],
      },
    ],
    nestedVerses: [],
    styleCapabilities: [],
    contacts: [],
  };
}

function buildEveSurface(snapshot) {
  const statusTone = snapshot.freshness.state === "fresh" ? "ok" : "warning";
  const tabRows = snapshot.tabs.slice(0, 20).map((tab) => ({
    id: `tab-${stableId(tab.id)}`,
    kind: "inspector.kv",
    props: {
      label: tab.title || "(untitled)",
      value: tab.url || "(no url)",
      tone: tab.canInspect ? "ok" : "muted",
      meta: {
        id: tab.id,
        attached: tab.attached,
        canInspect: tab.canInspect,
      },
    },
    children: [],
  }));

  return {
    type: "surface-state",
    schema: "gamecult.eve.surface.v1",
    providerId,
    providerKind: "service.operator",
    title: "Loki Chrome",
    version: Date.parse(snapshot.observedAt),
    updatedAt: snapshot.observedAt,
    surface: {
      root: {
        id: "loki.chrome.root",
        kind: "surface",
        props: {
          layout: "operator",
          freshness: snapshot.freshness,
        },
        children: [
          {
            id: "loki.chrome.summary",
            kind: "panel",
            props: { title: "Chrome Observation", tone: statusTone },
            children: [
              metric("reachable", "Reachable", snapshot.freshness.state === "fresh" ? "yes" : "no", statusTone),
              metric("source", "Source", snapshot.activeSource, statusTone),
              metric("tabs", "Tabs", String(snapshot.summary.tabCount), "neutral"),
              metric("inspectable", "Inspectable", String(snapshot.summary.inspectableTabCount), "neutral"),
              metric(
                "debug-probe",
                "Debug sweep",
                snapshot.debugProbe
                  ? `${snapshot.summary.debugProbeAttachedTabCount}/${snapshot.summary.debugProbeAttemptedTabCount} tabs`
                  : "not run",
                snapshot.debugProbe ? "ok" : "muted",
              ),
              metric(
                "page-snapshot",
                "Page snapshot",
                snapshot.pageSnapshot
                  ? `${snapshot.summary.pageSnapshotVisibleTextLength} chars`
                  : "not captured",
                snapshot.pageSnapshot ? "ok" : "muted",
              ),
              {
                id: "loki.chrome.extension-endpoint",
                kind: "inspector.kv",
                props: {
                  label: "Extension ingest",
                  value: snapshot.extension.ingestEndpoint,
                  tone: snapshot.extension.reachable ? "ok" : "muted",
                },
                children: [],
              },
              {
                id: "loki.chrome.cdp-endpoint",
                kind: "inspector.kv",
                props: {
                  label: "CDP endpoint",
                  value: snapshot.cdp.endpoint,
                  tone: snapshot.cdp.reachable ? "ok" : "muted",
                },
                children: [],
              },
              snapshot.cdp.error && !snapshot.extension.reachable
                ? {
                    id: "loki.chrome.error",
                    kind: "text",
                    props: { text: snapshot.cdp.error, tone: "warning" },
                    children: [],
                  }
                : {
                    id: "loki.chrome.source-state",
                    kind: "inspector.kv",
                    props: {
                      label: "Source state",
                      value: `extension=${snapshot.sources.chromeExtension.state}; cdp=${snapshot.sources.cdp.state}`,
                      tone: "neutral",
                    },
                    children: [],
                  },
            ],
          },
          {
            id: "loki.chrome.tabs",
            kind: "panel",
            props: { title: "Observed Tabs", empty: snapshot.tabs.length === 0 },
            children: tabRows.length > 0
              ? tabRows
              : [
                  {
                    id: "loki.chrome.no-tabs",
                    kind: "text",
                    props: {
                      text: "No CDP page targets observed.",
                      tone: "muted",
                    },
                    children: [],
                  },
                ],
          },
        ],
      },
      styles: {
        tokens: {
          density: "operator",
          accent: "#39a275",
          warning: "#b7791f",
        },
      },
    },
    commands: [],
  };
}

function metric(id, label, value, tone) {
  return {
    id: `loki.chrome.metric.${id}`,
    kind: "metric",
    props: { label, value, tone },
    children: [],
  };
}

function stableId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80);
}

function stringOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function writeTypedDocument(filePath, document) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  const body = [
    `# cultcache-text-witness v0`,
    `# schema: ${document.schema}`,
    `# provider: ${document.providerId ?? providerId}`,
    `# updatedAt: ${document.updatedAt ?? document.observedAt ?? new Date().toISOString()}`,
    JSON.stringify(document, null, 2),
    "",
  ].join("\n");
  await writeFile(tempPath, body, "utf8");
  await rename(tempPath, filePath);
}

async function publishSnapshot(config, snapshot) {
  const advertisement = buildProviderAdvertisement(snapshot);
  const surface = buildEveSurface(snapshot);

  await Promise.all([
    writeTypedDocument(join(config.stateDir, "loki.chrome_snapshot.cc"), snapshot),
    writeTypedDocument(join(config.stateDir, "loki.provider_advertisement.cc"), advertisement),
    writeTypedDocument(join(config.stateDir, "loki.eve_surface.cc"), surface),
    snapshot.debugProbe
      ? writeTypedDocument(join(config.stateDir, "loki.chrome_debug_probe.cc"), snapshot.debugProbe)
      : Promise.resolve(),
    snapshot.pageSnapshot
      ? writeTypedDocument(join(config.stateDir, "loki.chrome_page_snapshot.cc"), snapshot.pageSnapshot)
      : Promise.resolve(),
  ]);

  return { advertisement, surface };
}

async function tick(config) {
  const cdpObservation = await observeChrome(config);
  const snapshot = buildSnapshot(config, cdpObservation, runtime.extensionObservation);
  await publishSnapshot(config, snapshot);
  const state = snapshot.freshness.state;
  const count = snapshot.summary.tabCount;
  runtime.lastSnapshot = snapshot;
  console.log(`${snapshot.observedAt} ${state} source=${snapshot.activeSource} tabs=${count} cdp=${snapshot.sources.cdp.state} extension=${snapshot.sources.chromeExtension.state}`);
}

const runtime = {
  extensionObservation: null,
  lastSnapshot: null,
};

function startExtensionIngestServer(config) {
  const server = createServer(async (request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (request.method === "GET" && request.url === "/health") {
        writeJson(response, 200, {
          ok: true,
          providerId,
          serviceId,
          ingest: `http://${config.extensionHost}:${config.extensionPort}/ingest/chrome-extension`,
          lastSnapshotAt: runtime.lastSnapshot?.observedAt ?? null,
        });
        return;
      }

      if (request.method === "GET" && request.url === "/state") {
        writeJson(response, 200, runtime.lastSnapshot ?? unreachableSnapshot(config, "no snapshot published yet"));
        return;
      }

      if (request.method === "POST" && request.url === "/ingest/chrome-extension") {
        const payload = await readJsonBody(request);
        runtime.extensionObservation = normalizeExtensionObservation(payload, config);
        const cdpObservation = await observeChrome(config);
        const snapshot = buildSnapshot(config, cdpObservation, runtime.extensionObservation);
        await publishSnapshot(config, snapshot);
        runtime.lastSnapshot = snapshot;
        writeJson(response, 202, {
          accepted: true,
          schema: snapshot.schema,
          activeSource: snapshot.activeSource,
          tabs: snapshot.summary.tabCount,
          debugProbe: snapshot.debugProbe ? snapshot.debugProbe : null,
          pageSnapshot: snapshot.pageSnapshot ? snapshot.pageSnapshot : null,
          observedAt: snapshot.observedAt,
        });
        return;
      }

      writeJson(response, 404, { error: "not found" });
    } catch (error) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(config.extensionPort, config.extensionHost, () => {
    console.log(`Loki extension ingest listening on http://${config.extensionHost}:${config.extensionPort}`);
  });
  return server;
}

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  await tick(config);
  if (config.once) return;

  startExtensionIngestServer(config);
  setInterval(() => {
    tick(config).catch((error) => {
      console.error(error);
    });
  }, config.intervalMs);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
