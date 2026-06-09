const DEFAULT_ENDPOINT = "http://127.0.0.1:17666/ingest/chrome-extension";
const STATUS_KEY = "lokiStatus";
const CONFIG_KEY = "lokiConfig";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("loki-sync", { periodInMinutes: 1 });
  syncTabs("installed");
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("loki-sync", { periodInMinutes: 1 });
  syncTabs("startup");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "loki-sync") syncTabs("alarm");
});

chrome.tabs.onCreated.addListener(() => syncTabs("tab-created"));
chrome.tabs.onUpdated.addListener(() => syncTabs("tab-updated"));
chrome.tabs.onRemoved.addListener(() => syncTabs("tab-removed"));
chrome.tabs.onActivated.addListener(() => syncTabs("tab-activated"));
chrome.tabs.onMoved.addListener(() => syncTabs("tab-moved"));
chrome.tabs.onAttached.addListener(() => syncTabs("tab-attached"));
chrome.tabs.onDetached.addListener(() => syncTabs("tab-detached"));
chrome.tabs.onHighlighted.addListener(() => syncTabs("tab-highlighted"));
chrome.windows.onFocusChanged.addListener(() => syncTabs("window-focus"));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "loki.sync-now") {
    syncTabs("manual").then(sendResponse);
    return true;
  }
  if (message?.type === "loki.get-status") {
    getStatus().then(sendResponse);
    return true;
  }
  if (message?.type === "loki.set-endpoint") {
    setEndpoint(message.endpoint).then(sendResponse);
    return true;
  }
  return false;
});

async function syncTabs(reason) {
  const statusStartedAt = new Date().toISOString();
  try {
    const endpoint = await getEndpoint();
    const tabs = await chrome.tabs.query({});
    const report = {
      schema: "gamecult.loki.chrome_extension_report.v0",
      extensionVersion: chrome.runtime.getManifest().version,
      browser: navigator.userAgent,
      reportedAt: statusStartedAt,
      reason,
      tabs: tabs.map(projectTab),
      summary: {
        tabCount: tabs.length,
        activeTabCount: tabs.filter((tab) => tab.active).length,
      },
      redaction: {
        pageContent: "not-read",
        cookies: "not-read",
        tabMetadata: "title-url-favicon-window-state",
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseBody.error || `HTTP ${response.status}`);
    }

    const status = {
      ok: true,
      endpoint,
      reason,
      lastSyncAt: new Date().toISOString(),
      tabCount: tabs.length,
      activeSource: responseBody.activeSource ?? "unknown",
      error: null,
    };
    await chrome.storage.local.set({ [STATUS_KEY]: status });
    return status;
  } catch (error) {
    const endpoint = await getEndpoint();
    const status = {
      ok: false,
      endpoint,
      reason,
      lastSyncAt: new Date().toISOString(),
      tabCount: 0,
      activeSource: "none",
      error: error instanceof Error ? error.message : String(error),
    };
    await chrome.storage.local.set({ [STATUS_KEY]: status });
    return status;
  }
}

function projectTab(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    highlighted: tab.highlighted,
    pinned: tab.pinned,
    audible: tab.audible ?? false,
    muted: Boolean(tab.mutedInfo?.muted),
    incognito: tab.incognito,
    title: tab.title ?? null,
    url: tab.url ?? null,
    favIconUrl: tab.favIconUrl ?? null,
  };
}

async function getStatus() {
  const values = await chrome.storage.local.get([STATUS_KEY, CONFIG_KEY]);
  return {
    endpoint: values[CONFIG_KEY]?.endpoint ?? DEFAULT_ENDPOINT,
    status: values[STATUS_KEY] ?? null,
  };
}

async function getEndpoint() {
  const values = await chrome.storage.local.get(CONFIG_KEY);
  return values[CONFIG_KEY]?.endpoint ?? DEFAULT_ENDPOINT;
}

async function setEndpoint(endpoint) {
  const cleanEndpoint = String(endpoint || "").trim();
  if (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+\/ingest\/chrome-extension$/.test(cleanEndpoint)) {
    return {
      ok: false,
      error: "Endpoint must be http://127.0.0.1:<port>/ingest/chrome-extension or localhost.",
    };
  }
  await chrome.storage.local.set({ [CONFIG_KEY]: { endpoint: cleanEndpoint } });
  return syncTabs("endpoint-updated");
}
