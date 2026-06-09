const stateEl = document.querySelector("#state");
const tabsEl = document.querySelector("#tabs");
const lastSyncEl = document.querySelector("#last-sync");
const endpointEl = document.querySelector("#endpoint");
const debugEl = document.querySelector("#debug");
const errorEl = document.querySelector("#error");
const syncButton = document.querySelector("#sync");
const debugSweepButton = document.querySelector("#debug-sweep");

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  await chrome.runtime.sendMessage({ type: "loki.sync-now" });
  await render();
  syncButton.disabled = false;
});

debugSweepButton.addEventListener("click", async () => {
  debugSweepButton.disabled = true;
  await chrome.runtime.sendMessage({ type: "loki.debug-sweep" });
  await render();
  debugSweepButton.disabled = false;
});

await render();

async function render() {
  const result = await chrome.runtime.sendMessage({ type: "loki.get-status" });
  const status = result.status;
  endpointEl.textContent = result.endpoint;

  if (!status) {
    stateEl.textContent = "waiting";
    stateEl.className = "state";
    tabsEl.textContent = "-";
    debugEl.textContent = "-";
    lastSyncEl.textContent = "-";
    errorEl.hidden = true;
    return;
  }

  stateEl.textContent = status.ok ? "connected" : "offline";
  stateEl.className = `state ${status.ok ? "ok" : "bad"}`;
  tabsEl.textContent = String(status.tabCount ?? 0);
  debugEl.textContent = formatDebugProbe(status.debugProbe);
  lastSyncEl.textContent = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : "-";

  if (status.error) {
    errorEl.textContent = status.error;
    errorEl.hidden = false;
  } else {
    errorEl.hidden = true;
  }
}

function formatDebugProbe(debugProbe) {
  if (!debugProbe) return "not run";
  const summary = debugProbe.summary ?? {};
  return `${summary.attachedTabCount ?? 0}/${summary.attemptedTabCount ?? 0} attached`;
}
