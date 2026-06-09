# Loki Architecture

## Objective

Expose local Chrome tab state as provider-owned, typed service state for
CultMesh/Eve consumers.

## Current Mechanism

Chrome exposes DevTools metadata on `127.0.0.1:{port}` when started with
`--remote-debugging-port`. Loki polls the version and tab-list endpoints,
normalizes the result, and writes three documents from the same snapshot.

```mermaid
flowchart LR
  Chrome["Chrome CDP endpoint"] --> Observe["observeChrome"]
  Config["Loki config"] --> Observe
  Observe --> Snapshot["chrome_snapshot.cc"]
  Snapshot --> Provider["provider_advertisement.cc"]
  Snapshot --> Surface["eve_surface.cc"]
```

## Invariants

- CDP reachability is observed state, not assumed capability.
- Chrome owns page reality; Loki owns only the observation snapshot.
- `.cc` witnesses are the durable local state surface.
- Eve/CultUI output is derived from the same snapshot as the witness.
- No renderer or dashboard can override the daemon's observation state.

## Intended Change Path

1. Add CultCacheTS-backed binary `.cc` persistence behind the current writer.
2. Add CultNet/CultMesh publication of the same documents.
3. Add command handling only through `gamecult.eve.command.v1`.
4. Add consentful CDP actions, starting with read-only page metadata and
   operator-approved screenshot capture.

## Command Boundary

Loki currently advertises no executable tab commands. This is deliberate. A
daemon that can evaluate JavaScript inside live user tabs is holding a sharp
tool; it needs an explicit command document, audit log, origin, target tab id,
and denial path before it should act.
