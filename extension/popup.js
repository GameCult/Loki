const stateEl = document.querySelector("#state");
const tabsEl = document.querySelector("#tabs");
const lastSyncEl = document.querySelector("#last-sync");
const endpointEl = document.querySelector("#endpoint");
const errorEl = document.querySelector("#error");
const syncButton = document.querySelector("#sync");

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  await chrome.runtime.sendMessage({ type: "loki.sync-now" });
  await render();
  syncButton.disabled = false;
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
    lastSyncEl.textContent = "-";
    errorEl.hidden = true;
    return;
  }

  stateEl.textContent = status.ok ? "connected" : "offline";
  stateEl.className = `state ${status.ok ? "ok" : "bad"}`;
  tabsEl.textContent = String(status.tabCount ?? 0);
  lastSyncEl.textContent = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : "-";

  if (status.error) {
    errorEl.textContent = status.error;
    errorEl.hidden = false;
  } else {
    errorEl.hidden = true;
  }
}
