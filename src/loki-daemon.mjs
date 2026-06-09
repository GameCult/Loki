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
    intervalMs: Number(process.env.LOKI_INTERVAL_MS ?? 5000),
    stateDir: process.env.LOKI_STATE_DIR ?? defaultStateDir,
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") config.once = true;
    else if (arg === "--host") config.host = argv[++index] ?? config.host;
    else if (arg === "--port") config.port = Number(argv[++index] ?? config.port);
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
  return config;
}

function printHelp() {
  console.log(`Loki Chrome CultMesh daemon

Usage:
  node src/loki-daemon.mjs [--once] [--host 127.0.0.1] [--port 9222]
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
      schema: "gamecult.loki.chrome_snapshot.v0",
      providerId,
      serviceId,
      observedAt,
      freshness: {
        state: "fresh",
        lastSeenAt: observedAt,
        maxAgeMs: config.intervalMs * 3,
      },
      cdp: {
        endpoint: baseUrl,
        reachable: true,
        browser: stringOrNull(version.Browser),
        protocolVersion: stringOrNull(version["Protocol-Version"]),
        userAgent: stringOrNull(version["User-Agent"]),
        webSocketDebuggerUrl: stringOrNull(version.webSocketDebuggerUrl),
      },
      tabs,
      summary: {
        tabCount: tabs.length,
        inspectableTabCount: tabs.filter((tab) => tab.webSocketDebuggerUrl).length,
      },
      redaction: {
        urlQuery: "preserved",
        titles: "preserved",
        pageContent: "not-read",
        cookies: "not-read",
      },
    };
  } catch (error) {
    return {
      schema: "gamecult.loki.chrome_snapshot.v0",
      providerId,
      serviceId,
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
      summary: {
        tabCount: 0,
        inspectableTabCount: 0,
      },
      redaction: {
        urlQuery: "not-observed",
        titles: "not-observed",
        pageContent: "not-read",
        cookies: "not-read",
      },
    };
  }
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
        kind: "local-cultcache-witness",
        address: "state/",
        carries: [
          "state/loki.chrome_snapshot.cc",
          "state/loki.provider_advertisement.cc",
          "state/loki.eve_surface.cc",
        ],
      },
    ],
    nestedVerses: [],
    styleCapabilities: [],
    contacts: [],
  };
}

function buildEveSurface(snapshot) {
  const statusTone = snapshot.cdp.reachable ? "ok" : "warning";
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
            props: { title: "Chrome DevTools", tone: statusTone },
            children: [
              metric("reachable", "Reachable", snapshot.cdp.reachable ? "yes" : "no", statusTone),
              metric("tabs", "Tabs", String(snapshot.summary.tabCount), "neutral"),
              metric("inspectable", "Inspectable", String(snapshot.summary.inspectableTabCount), "neutral"),
              {
                id: "loki.chrome.endpoint",
                kind: "inspector.kv",
                props: {
                  label: "Endpoint",
                  value: snapshot.cdp.endpoint,
                  tone: statusTone,
                },
                children: [],
              },
              snapshot.cdp.error
                ? {
                    id: "loki.chrome.error",
                    kind: "text",
                    props: { text: snapshot.cdp.error, tone: "warning" },
                    children: [],
                  }
                : {
                    id: "loki.chrome.browser",
                    kind: "inspector.kv",
                    props: {
                      label: "Browser",
                      value: snapshot.cdp.browser ?? "unknown",
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
  ]);

  return { advertisement, surface };
}

async function tick(config) {
  const snapshot = await observeChrome(config);
  await publishSnapshot(config, snapshot);
  const state = snapshot.freshness.state;
  const count = snapshot.summary.tabCount;
  console.log(`${snapshot.observedAt} ${state} tabs=${count} endpoint=${snapshot.cdp.endpoint}`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  await tick(config);
  if (config.once) return;

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
