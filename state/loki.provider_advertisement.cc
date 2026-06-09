# cultcache-text-witness v0
# schema: gamecult.eve.provider_advertisement.v1
# provider: loki.chrome
# updatedAt: 2026-06-09T15:11:06.124Z
{
  "schema": "gamecult.eve.provider_advertisement.v1",
  "providerId": "loki.chrome",
  "serviceId": "loki.chrome_daemon",
  "verseId": "loki.local",
  "rootVerse": "asgard",
  "canonicalService": "asgard.loki.chrome",
  "locatedService": "asgard.localhost.loki.chrome",
  "cultMeshAddress": "asgard.localhost.loki.chrome/eve/gui",
  "title": "Loki Chrome",
  "kind": "service.operator",
  "updatedAt": "2026-06-09T15:11:06.124Z",
  "freshness": {
    "state": "unreachable",
    "lastSeenAt": null,
    "maxAgeMs": 15000
  },
  "schemas": [
    {
      "schema": "gamecult.loki.chrome_snapshot.v0",
      "owner": "loki.chrome",
      "authority": "observed",
      "storage": "cultcache-cc",
      "cultMeshAddress": "asgard.localhost.loki.chrome/state/snapshot",
      "portable": true
    },
    {
      "schema": "gamecult.loki.chrome_extension_report.v0",
      "owner": "loki.chrome",
      "authority": "external-authority-projection",
      "storage": "ingest-only",
      "cultMeshAddress": "asgard.localhost.loki.chrome/ingest/chrome-extension",
      "portable": true
    },
    {
      "schema": "gamecult.eve.surface.v1",
      "owner": "loki.chrome",
      "authority": "derived",
      "storage": "cultcache-cc",
      "cultMeshAddress": "asgard.localhost.loki.chrome/eve/gui",
      "portable": true
    }
  ],
  "witnesses": [
    {
      "id": "loki.chrome.snapshot",
      "kind": "cc-export",
      "path": "state/loki.chrome_snapshot.cc",
      "schemas": [
        "gamecult.loki.chrome_snapshot.v0"
      ],
      "redaction": {
        "urlQuery": "not-observed",
        "titles": "not-observed",
        "pageContent": "not-read",
        "cookies": "not-read",
        "source": "none"
      },
      "freshness": {
        "state": "unreachable",
        "updatedAt": "2026-06-09T15:11:06.124Z"
      }
    },
    {
      "id": "loki.chrome.eve_surface",
      "kind": "cc-export",
      "path": "state/loki.eve_surface.cc",
      "schemas": [
        "gamecult.eve.surface.v1"
      ],
      "redaction": "derived-operator-surface",
      "freshness": {
        "state": "unreachable",
        "updatedAt": "2026-06-09T15:11:06.124Z"
      }
    }
  ],
  "surfaces": [
    {
      "surfaceId": "loki.chrome.operator",
      "schema": "gamecult.eve.surface.v1",
      "transport": "cultmesh-document",
      "address": "asgard.localhost.loki.chrome/eve/gui",
      "tuiAddress": "asgard.localhost.loki.chrome/eve/tui",
      "audience": "operator",
      "mode": "read-only",
      "styleProfile": "loki.operator",
      "commands": []
    }
  ],
  "commands": [],
  "routes": [
    {
      "kind": "local-cdp",
      "address": "http://127.0.0.1:9222",
      "carries": [
        "chrome-target-metadata"
      ],
      "note": "Requires user-launched Chrome with --remote-debugging-port."
    },
    {
      "kind": "chrome-extension-ingest",
      "address": "http://127.0.0.1:17666/ingest/chrome-extension",
      "carries": [
        "chrome-extension-tab-metadata"
      ],
      "note": "Preferred drop-in Chrome path; extension observes tab metadata and Loki owns persistence."
    },
    {
      "kind": "local-cultcache-witness",
      "address": "state/",
      "carries": [
        "state/loki.chrome_snapshot.cc",
        "state/loki.provider_advertisement.cc",
        "state/loki.eve_surface.cc"
      ]
    }
  ],
  "nestedVerses": [],
  "styleCapabilities": [],
  "contacts": []
}
