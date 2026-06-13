import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const stateDir = await mkdtemp(join(tmpdir(), "loki-extension-smoke-"));
const extensionPort = await reservePort();
const cdpPort = await reservePort();
const daemon = spawn(process.execPath, [
  "src/loki-daemon.mjs",
  "--port",
  String(cdpPort),
  "--extension-port",
  String(extensionPort),
  "--interval-ms",
  "60000",
  "--state-dir",
  stateDir,
], {
  cwd: new URL("..", import.meta.url),
  stdio: "pipe",
});

let stderr = "";
daemon.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
  await waitForHealth(extensionPort);
  const response = await fetch(`http://127.0.0.1:${extensionPort}/ingest/chrome-extension`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schema: "gamecult.loki.chrome_extension_report.v0",
      extensionVersion: "fixture",
      browser: "Chrome fixture",
      reportedAt: new Date().toISOString(),
      reason: "smoke",
      debugProbe: {
        schema: "gamecult.loki.chrome_debug_probe.v0",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        protocolVersion: "1.3",
        targetCount: 1,
        targets: [{ id: "fixture-target", tabId: 100, type: "page", title: "Portal das Financas", url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap", attached: false }],
        tabs: [{
          tabId: 100,
          windowId: 1,
          title: "Portal das Financas",
          url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap",
          attached: true,
          attachError: null,
          commands: [{ method: "Page.getFrameTree", ok: true }],
          frameTree: { frameTree: { frame: { id: "frame-1", url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap" } } },
          runtime: { result: { type: "object", value: { href: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap" } } },
          performanceMetrics: { metrics: [] },
          securityState: null,
          domRoot: { root: { nodeId: 1, nodeName: "#document" } },
        }],
        summary: {
          attemptedTabCount: 1,
          attachedTabCount: 1,
          failedTabCount: 0,
          commandCount: 1,
          commandFailureCount: 0,
        },
        redaction: {
          pageContent: "not-read",
          cookies: "not-read",
          responseBodies: "not-read",
          domTree: "root-node-only",
          runtimeEvaluation: "fixture",
        },
      },
      pageSnapshot: {
        schema: "gamecult.loki.chrome_page_snapshot.v0",
        capturedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        tab: {
          id: 100,
          windowId: 1,
          index: 0,
          active: true,
          highlighted: true,
          pinned: false,
          audible: false,
          muted: false,
          incognito: false,
          title: "Portal das Financas",
          url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap",
          favIconUrl: null,
        },
        attached: true,
        attachError: null,
        error: null,
        content: {
          href: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap",
          title: "Portal das Financas",
          readyState: "complete",
          language: "pt",
          visibleText: "Entregar declaracao IRS Consultar pagamentos",
          visibleTextLength: 43,
          headings: [{ level: "h1", text: "Portal das Financas" }],
          links: [{ text: "Consultar pagamentos", href: "https://sitfiscal.portaldasfinancas.gov.pt/pagamentos" }],
        },
        forms: {
          controlCount: 1,
          controls: [{ tag: "button", type: "button", label: "", selector: "button", name: null, id: null, disabled: false, required: false, value: "" }],
        },
        redaction: {
          trigger: "operator-popup-click",
          scope: "active-tab-only",
          pageContent: "visible-text-and-page-structure",
          cookies: "not-read",
          passwordValues: "redacted",
          hiddenInputs: "omitted",
          responseBodies: "not-read",
        },
      },
      tabs: [
        {
          id: 100,
          windowId: 1,
          index: 0,
          active: true,
          highlighted: true,
          pinned: false,
          audible: false,
          muted: false,
          incognito: false,
          title: "Portal das Financas",
          url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap",
          favIconUrl: null,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`ingest failed: HTTP ${response.status} ${await response.text()}`);
  }

  const snapshotText = await readFile(join(stateDir, "loki.chrome_snapshot.cc"), "utf8");
  const debugProbeText = await readFile(join(stateDir, "loki.chrome_debug_probe.cc"), "utf8");
  const pageSnapshotText = await readFile(join(stateDir, "loki.chrome_page_snapshot.cc"), "utf8");
  if (!snapshotText.includes('"activeSource": "chrome-extension"')) {
    throw new Error("snapshot did not choose chrome-extension as active source");
  }
  if (!snapshotText.includes("Portal das Financas")) {
    throw new Error("snapshot did not include extension tab");
  }
  if (!debugProbeText.includes('"schema": "gamecult.loki.chrome_debug_probe.v0"')) {
    throw new Error("debug probe witness was not written");
  }
  if (!pageSnapshotText.includes('"schema": "gamecult.loki.chrome_page_snapshot.v0"')) {
    throw new Error("page snapshot witness was not written");
  }
  if (!pageSnapshotText.includes("Entregar declaracao IRS")) {
    throw new Error("page snapshot did not preserve visible page text");
  }

  console.log("extension ingest smoke passed");
} finally {
  daemon.kill();
  await rm(stateDir, { recursive: true, force: true });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`daemon did not become healthy: ${stderr}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
