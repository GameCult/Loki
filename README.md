# Loki

Loki is a CultMesh-oriented daemon for observing local Chrome tabs through a
drop-in Chrome extension or an explicit Chrome DevTools Protocol endpoint.

It does not see ordinary locked Chrome tabs by magic. The easy path is loading
the unpacked extension in `extension/`; the developer path is launching Chrome
with a remote debugging port. The daemon publishes reachability as state instead
of pretending.

## Authority Map

- Owner: Loki owns Chrome DevTools observation and the derived operator surface.
- Inputs: Chrome extension reports, `http://127.0.0.1:9222/json/version`,
  `http://127.0.0.1:9222/json/list`, and daemon configuration.
- Outputs: typed `.cc` witness documents, an Eve provider advertisement, and a
  `gamecult.eve.surface.v1` surface projection.
- Derived state: Eve surface health, tab counts, selected tab hints, and
  operator text are derived from the Chrome snapshot.
- Forbidden writers: renderers, dashboards, ad hoc scripts, and browser windows
  do not own Loki state.
- Shared paths: extension and CDP observations are normalized into one snapshot
  before witness, advertisement, and Eve projection.
- Cut line: command execution is not implemented until it has an auditable
  command envelope and explicit consent boundary.

## Drop Into Chrome

Run Loki:

```powershell
cd E:\Projects\Loki
npm run start
```

Then install the extension:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Choose `Load unpacked`.
4. Select `E:\Projects\Loki\extension`.

The extension posts tab metadata to
`http://127.0.0.1:17666/ingest/chrome-extension`. It does not read page DOM,
cookies, or page content.

## CDP Observation

Close Chrome or use a separate profile, then launch:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\loki-chrome-profile"
```

For a one-shot smoke:

```powershell
npm run smoke
```

## State Files

Loki writes:

- `state/loki.chrome_snapshot.cc`
- `state/loki.provider_advertisement.cc`
- `state/loki.eve_surface.cc`

These first `.cc` documents are typed text witnesses. They preserve schema
identity, provider authority, and redaction posture while the daemon awaits a
direct CultCacheTS/CultNetTS backing store integration.
