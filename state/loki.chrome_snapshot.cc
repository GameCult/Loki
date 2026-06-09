# cultcache-text-witness v0
# schema: gamecult.loki.chrome_snapshot.v0
# provider: loki.chrome
# updatedAt: 2026-06-09T15:11:06.124Z
{
  "schema": "gamecult.loki.chrome_snapshot.v0",
  "providerId": "loki.chrome",
  "serviceId": "loki.chrome_daemon",
  "observedAt": "2026-06-09T15:11:06.124Z",
  "activeSource": "none",
  "freshness": {
    "state": "unreachable",
    "lastSeenAt": null,
    "maxAgeMs": 15000
  },
  "sources": {
    "cdp": {
      "state": "unreachable",
      "observedAt": "2026-06-09T15:11:06.096Z"
    },
    "chromeExtension": {
      "state": "missing",
      "observedAt": null
    }
  },
  "cdp": {
    "endpoint": "http://127.0.0.1:9222",
    "reachable": false,
    "error": "fetch failed"
  },
  "extension": {
    "reachable": false,
    "ingestEndpoint": "http://127.0.0.1:17666/ingest/chrome-extension",
    "error": "no extension report received"
  },
  "tabs": [],
  "summary": {
    "tabCount": 0,
    "inspectableTabCount": 0,
    "activeTabCount": 0
  },
  "redaction": {
    "urlQuery": "not-observed",
    "titles": "not-observed",
    "pageContent": "not-read",
    "cookies": "not-read",
    "source": "none"
  }
}
