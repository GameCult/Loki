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
  if (!snapshotText.includes('"activeSource": "chrome-extension"')) {
    throw new Error("snapshot did not choose chrome-extension as active source");
  }
  if (!snapshotText.includes("Portal das Financas")) {
    throw new Error("snapshot did not include extension tab");
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
