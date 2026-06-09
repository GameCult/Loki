# cultcache-text-witness v0
# schema: gamecult.eve.surface.v1
# provider: loki.chrome
# updatedAt: 2026-06-09T15:11:06.124Z
{
  "type": "surface-state",
  "schema": "gamecult.eve.surface.v1",
  "providerId": "loki.chrome",
  "providerKind": "service.operator",
  "title": "Loki Chrome",
  "version": 1781017866124,
  "updatedAt": "2026-06-09T15:11:06.124Z",
  "surface": {
    "root": {
      "id": "loki.chrome.root",
      "kind": "surface",
      "props": {
        "layout": "operator",
        "freshness": {
          "state": "unreachable",
          "lastSeenAt": null,
          "maxAgeMs": 15000
        }
      },
      "children": [
        {
          "id": "loki.chrome.summary",
          "kind": "panel",
          "props": {
            "title": "Chrome Observation",
            "tone": "warning"
          },
          "children": [
            {
              "id": "loki.chrome.metric.reachable",
              "kind": "metric",
              "props": {
                "label": "Reachable",
                "value": "no",
                "tone": "warning"
              },
              "children": []
            },
            {
              "id": "loki.chrome.metric.source",
              "kind": "metric",
              "props": {
                "label": "Source",
                "value": "none",
                "tone": "warning"
              },
              "children": []
            },
            {
              "id": "loki.chrome.metric.tabs",
              "kind": "metric",
              "props": {
                "label": "Tabs",
                "value": "0",
                "tone": "neutral"
              },
              "children": []
            },
            {
              "id": "loki.chrome.metric.inspectable",
              "kind": "metric",
              "props": {
                "label": "Inspectable",
                "value": "0",
                "tone": "neutral"
              },
              "children": []
            },
            {
              "id": "loki.chrome.extension-endpoint",
              "kind": "inspector.kv",
              "props": {
                "label": "Extension ingest",
                "value": "http://127.0.0.1:17666/ingest/chrome-extension",
                "tone": "muted"
              },
              "children": []
            },
            {
              "id": "loki.chrome.cdp-endpoint",
              "kind": "inspector.kv",
              "props": {
                "label": "CDP endpoint",
                "value": "http://127.0.0.1:9222",
                "tone": "muted"
              },
              "children": []
            },
            {
              "id": "loki.chrome.error",
              "kind": "text",
              "props": {
                "text": "fetch failed",
                "tone": "warning"
              },
              "children": []
            }
          ]
        },
        {
          "id": "loki.chrome.tabs",
          "kind": "panel",
          "props": {
            "title": "Observed Tabs",
            "empty": true
          },
          "children": [
            {
              "id": "loki.chrome.no-tabs",
              "kind": "text",
              "props": {
                "text": "No CDP page targets observed.",
                "tone": "muted"
              },
              "children": []
            }
          ]
        }
      ]
    },
    "styles": {
      "tokens": {
        "density": "operator",
        "accent": "#39a275",
        "warning": "#b7791f"
      }
    }
  },
  "commands": []
}
