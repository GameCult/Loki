import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const fixtures = {
  "/json/version": {
    Browser: "Chrome/fixture",
    "Protocol-Version": "1.3",
    "User-Agent": "Fixture",
    webSocketDebuggerUrl: "ws://127.0.0.1:0/devtools/browser/fixture",
  },
  "/json/list": [
    {
      id: "tab-1",
      type: "page",
      title: "Portal das Financas",
      url: "https://sitfiscal.portaldasfinancas.gov.pt/geral/siteMap",
      webSocketDebuggerUrl: "ws://127.0.0.1:0/devtools/page/tab-1",
      attached: false,
    },
  ],
};

const server = createServer((request, response) => {
  const payload = fixtures[request.url];
  if (!payload) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
});

const stateDir = await mkdtemp(join(tmpdir(), "loki-smoke-"));

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await runDaemonOnce(port, stateDir);

  const snapshotText = await readFile(join(stateDir, "loki.chrome_snapshot.cc"), "utf8");
  const surfaceText = await readFile(join(stateDir, "loki.eve_surface.cc"), "utf8");

  if (!snapshotText.includes('"state": "fresh"')) throw new Error("snapshot did not become fresh");
  if (!snapshotText.includes("Portal das Financas")) throw new Error("snapshot did not include fixture tab");
  if (!surfaceText.includes('"schema": "gamecult.eve.surface.v1"')) throw new Error("surface schema missing");

  console.log("fixture CDP smoke passed");
} finally {
  server.close();
  await rm(stateDir, { recursive: true, force: true });
}

function runDaemonOnce(port, targetStateDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "src/loki-daemon.mjs",
      "--once",
      "--port",
      String(port),
      "--state-dir",
      targetStateDir,
    ], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`daemon exited ${code}: ${stderr}`));
    });
  });
}
