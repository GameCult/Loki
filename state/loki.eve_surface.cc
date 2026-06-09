# cultcache-text-witness v0
# schema: gamecult.eve.surface.v1
# provider: loki.chrome
# updatedAt: 2026-06-09T14:02:52.753Z
{
  "type": "surface-state",
  "schema": "gamecult.eve.surface.v1",
  "providerId": "loki.chrome",
  "providerKind": "service.operator",
  "title": "Loki Chrome",
  "version": 1781013772753,
  "updatedAt": "2026-06-09T14:02:52.753Z",
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
            "title": "Chrome DevTools",
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
              "id": "loki.chrome.endpoint",
              "kind": "inspector.kv",
              "props": {
                "label": "Endpoint",
                "value": "http://127.0.0.1:9222",
                "tone": "warning"
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
