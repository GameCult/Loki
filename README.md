# Loki

Loki is a CultMesh-oriented daemon for observing local Chrome tabs through an
explicit Chrome DevTools Protocol endpoint.

It does not see ordinary locked Chrome tabs by magic. Chrome must be launched
with a remote debugging port, and the daemon publishes that reachability as
state instead of pretending.

## Authority Map

- Owner: Loki owns Chrome DevTools observation and the derived operator surface.
- Inputs: `http://127.0.0.1:9222/json/version`,
  `http://127.0.0.1:9222/json/list`, and daemon configuration.
- Outputs: typed `.cc` witness documents, an Eve provider advertisement, and a
  `gamecult.eve.surface.v1` surface projection.
- Derived state: Eve surface health, tab counts, selected tab hints, and
  operator text are derived from the Chrome snapshot.
- Forbidden writers: renderers, dashboards, ad hoc scripts, and browser windows
  do not own Loki state.
- Shared paths: one `observeChrome()` path feeds witness, advertisement, and
  Eve projection.
- Cut line: command execution is not implemented until it has an auditable
  command envelope and explicit consent boundary.

## Start Chrome For Observation

Close Chrome or use a separate profile, then launch:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\loki-chrome-profile"
```

Then run Loki:

```powershell
cd E:\Projects\Loki
npm run start
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
