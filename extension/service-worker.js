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
  if (message?.type === "loki.debug-sweep") {
    debugSweep().then(sendResponse);
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

async function syncTabs(reason, extra = {}) {
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
        debugProbe: extra.debugProbe ? "runtime-frame-performance-security-metadata" : "not-run",
      },
      ...extra,
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
      debugProbe: responseBody.debugProbe ?? null,
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
      debugProbe: null,
      activeSource: "none",
      error: error instanceof Error ? error.message : String(error),
    };
    await chrome.storage.local.set({ [STATUS_KEY]: status });
    return status;
  }
}

async function debugSweep() {
  const startedAt = new Date().toISOString();
  const tabs = await chrome.tabs.query({});
  const targets = await chromeDebuggerGetTargets();
  const probe = {
    schema: "gamecult.loki.chrome_debug_probe.v0",
    startedAt,
    completedAt: null,
    protocolVersion: "1.3",
    targetCount: targets.length,
    targets: targets.map(projectDebugTarget),
    tabs: [],
    summary: {
      attemptedTabCount: 0,
      attachedTabCount: 0,
      failedTabCount: 0,
      commandCount: 0,
      commandFailureCount: 0,
    },
    redaction: {
      pageContent: "not-read",
      cookies: "not-read",
      responseBodies: "not-read",
      domTree: "root-node-only",
      runtimeEvaluation: "location-title-readyState-visibility-performance-navigator",
    },
  };

  for (const tab of tabs) {
    if (!Number.isInteger(tab.id)) continue;
    probe.summary.attemptedTabCount += 1;
    const tabProbe = await probeTab(tab);
    probe.tabs.push(tabProbe);
    if (tabProbe.attached) probe.summary.attachedTabCount += 1;
    else probe.summary.failedTabCount += 1;
    probe.summary.commandCount += tabProbe.commands.length;
    probe.summary.commandFailureCount += tabProbe.commands.filter((command) => !command.ok).length;
  }

  probe.completedAt = new Date().toISOString();
  return syncTabs("debug-sweep", { debugProbe: probe });
}

async function probeTab(tab) {
  const target = { tabId: tab.id };
  const tabProbe = {
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title ?? null,
    url: tab.url ?? null,
    attached: false,
    attachError: null,
    commands: [],
    frameTree: null,
    runtime: null,
    performanceMetrics: null,
    securityState: null,
    domRoot: null,
  };

  try {
    await chromeDebuggerAttach(target, "1.3");
    tabProbe.attached = true;

    await recordCommand(tabProbe, target, "Page.enable");
    await recordCommand(tabProbe, target, "Runtime.enable");
    await recordCommand(tabProbe, target, "Log.enable");
    await recordCommand(tabProbe, target, "Performance.enable");
    await recordCommand(tabProbe, target, "Security.enable");
    await recordCommand(tabProbe, target, "DOM.enable");

    tabProbe.frameTree = await recordCommand(tabProbe, target, "Page.getFrameTree");
    tabProbe.runtime = await recordCommand(tabProbe, target, "Runtime.evaluate", {
      expression: `({
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        visibilityState: document.visibilityState,
        referrer: document.referrer,
        origin: location.origin,
        navigation: performance.getEntriesByType("navigation").map((entry) => entry.toJSON?.() ?? {}),
        screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
        navigator: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          languages: navigator.languages,
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemory: navigator.deviceMemory ?? null,
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled
        }
      })`,
      returnByValue: true,
      awaitPromise: false,
    });
    tabProbe.performanceMetrics = await recordCommand(tabProbe, target, "Performance.getMetrics");
    tabProbe.securityState = await recordCommand(tabProbe, target, "Security.getSecurityState");
    tabProbe.domRoot = await recordCommand(tabProbe, target, "DOM.getDocument", { depth: 0, pierce: false });
  } catch (error) {
    tabProbe.attachError = error instanceof Error ? error.message : String(error);
  } finally {
    if (tabProbe.attached) {
      await chromeDebuggerDetach(target).catch(() => {});
    }
  }

  return tabProbe;
}

async function recordCommand(tabProbe, target, method, params = undefined) {
  try {
    const result = await chromeDebuggerSendCommand(target, method, params);
    tabProbe.commands.push({ method, ok: true });
    return result ?? {};
  } catch (error) {
    tabProbe.commands.push({
      method,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function projectDebugTarget(target) {
  return {
    id: target.id ?? null,
    tabId: target.tabId ?? null,
    type: target.type ?? null,
    title: target.title ?? null,
    url: target.url ?? null,
    attached: Boolean(target.attached),
    extensionId: target.extensionId ?? null,
  };
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

function chromeDebuggerGetTargets() {
  return new Promise((resolve, reject) => {
    chrome.debugger.getTargets((targets) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(targets ?? []);
    });
  });
}

function chromeDebuggerAttach(target, protocolVersion) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, protocolVersion, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function chromeDebuggerSendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params ?? {}, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

function chromeDebuggerDetach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
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
