# SSHDeck UI Functionality Implementation Plan

## Goal

Keep the desktop UI and real product behavior in sync.

> Every visible interactive control must perform a complete action or clearly explain why it is unavailable. No enabled control may open placeholder-only content.

This milestone is a behavior, architecture, and release-quality pass rather than a visual redesign.

---

## Current production state

### Activity Bar

All currently visible Activity Bar surfaces are implemented:

- Servers;
- Remote Files / SFTP;
- Search;
- Port Forwarding;
- Sessions;
- History;
- Transfers;
- Settings.

### Bottom Panel

All visible panel tabs contain real data and behavior:

- Ports;
- Logs;
- Transfers.

The redundant Terminal panel was removed. The central PTY remains the terminal workspace.

### Inspector

The Inspector contains real shared product behavior:

- Server Status;
- compact Connection History;
- Quick Commands;
- Port Forwarding summary.

---

## Product rules

A control is complete only when:

1. it triggers a real state transition or backend operation;
2. loading, empty, error and disabled states are represented when applicable;
3. runtime prerequisites affect availability rather than feature readiness;
4. menu, shortcut, Activity Bar, Command Palette and other equivalent entry points use shared command routes;
5. destructive behavior keeps the appropriate confirmation policy;
6. background/cross-view subsystems have one logical state owner;
7. no `ready` command opens placeholder-only content;
8. the behavior is covered by automated CI and/or an explicit runtime smoke case.

### Feature readiness vs runtime availability

```ts
type FeatureReadiness = "ready" | "experimental" | "planned";

type CommandDefinition = {
  id: CommandId;
  readiness: FeatureReadiness;
  enabled: boolean;
  availabilityReason?: string;
  run: () => void | Promise<void>;
};
```

A feature may be `ready` while a command is temporarily disabled, for example when no server or tunnel is selected. Planned features remain absent from production UI.

### Shared lifecycle ownership

- `SessionProvider` owns logical sessions, active selection, persisted history and session navigation. `App` remains the OpenSSH/Tauri PTY + xterm runtime adapter.
- `TunnelProvider` owns saved tunnel definitions, status polling, start/stop, auto-restart and tunnel selection.
- `TransferProvider` consumes the single backend `TransferManager`.
- `LogProvider` owns the bounded structured in-memory event store.
- Settings are persisted in the versioned `workspace.json` schema; runtime-heavy settings are enforced by their authoritative backend subsystem.
- Workbench navigation state belongs to `WorkbenchContext`; equivalent UI entry points execute `CommandService` routes instead of reimplementing navigation locally.

---

## Implementation phases

### Phase 0 — Interaction truthfulness + feature/view registry ✅

Completed in PR #9.

- explicit `ready / experimental / planned` readiness;
- planned Activity Bar items hidden;
- placeholder panel surfaces removed;
- command readiness separated from runtime availability.

### Phase 1 — Ports workspace ✅

Completed in PR #10.

- local `-L`, remote `-R`, SOCKS `-D` CRUD;
- start/stop, status, diagnostics and bounded auto-restart;
- Activity Bar + Bottom Panel + Inspector share one `TunnelProvider`;
- Ports exposed through shared commands.

### Phase 2 — Sessions workspace ✅

Completed in PR #11.

- All / Active / Issues views;
- focus, reconnect, close, auto-reconnect controls;
- duration, exit code and signal diagnostics;
- one logical `SessionProvider`; PTY/xterm lifecycle remains in `App`.

### Phase 3 — Full History workspace ✅

Completed in PR #12.

- persisted search/filterable history;
- timestamps, duration, exit/signal diagnostics;
- reconnect and safe clear flow;
- bounded retention of 200 records;
- backward-compatible persisted fields.

### Phase 4 — Structured Logs / Diagnostics panel ✅

Completed in PR #13.

- real Bottom Panel Logs surface;
- SSH/session, reconnect, tunnel, transfer and completed SFTP diagnostic events;
- severity/subsystem/text filtering;
- bounded 500-event in-memory retention;
- centralized redaction of credentials, tokens and private-key material;
- raw terminal/password-prompt output is never logged.

### Phase 5 — Workbench Search ✅

Completed in PR #14.

Searches existing state owners without adding another polling/index service:

- Servers;
- Sessions;
- History;
- Ports;
- Transfers;
- Quick Commands;
- SSHDeck commands.

Quick Commands are copy-only from Search so command-safety confirmation cannot be bypassed. Recursive remote SFTP search remains intentionally out of scope.

### Phase 6 — Versioned Settings ✅

Completed in PR #15.

`workspace.json` now contains settings schema v1 with legacy defaults, explicit v0 migration, current-value validation and future-schema rejection.

Implemented settings:

- Auto reconnect default for new sessions;
- diagnostic timeout: 2–30 seconds;
- transfer concurrency: 1–6, applied to the live backend manager;
- Quick Command safety: Standard / Strict;
- restore saved workspace layout on startup.

OpenSSH binary override remains intentionally hidden until every `ssh`/`sftp` subprocess path can use one transport configuration.

### Phase 7 — Navigation / UX consistency ✅

Implemented in PR #18.

- primary workspace selection moved into `WorkbenchContext`;
- Activity Bar routes Servers / Remote Files / Search / Ports / Sessions / History / Settings through `CommandService`;
- Transfers Activity action and all Bottom Panel tabs use shared panel commands;
- Inspector and Search routes to Ports/Transfers use those same commands;
- `Ctrl+Shift+K` now reveals the primary sidebar, switches to Servers and focuses the server search after render;
- Command Palette shows ready-but-unavailable commands with their availability reason instead of silently hiding them;
- keyboard navigation skips disabled palette commands;
- Command Palette restores the previous focus target when closed;
- primary-sidebar terminology is consistent with the fact that the sidebar contains more than Servers.

### Phase 8 — Automated + Windows runtime release gate ⏳

Remaining release gate.

Automated requirements:

- Rust format;
- Clippy;
- Rust tests;
- frontend TypeScript/Vite build;
- Tauri backend check;
- add targeted automated coverage for Workbench command/navigation invariants where practical;
- add/verify a Windows CI path suitable for desktop release confidence.

Windows runtime smoke coverage must verify ready product surfaces, including:

- Servers and OpenSSH import/export;
- terminal sessions, navigation, reconnect and close;
- Remote Files + SFTP diagnostics;
- Transfers;
- Ports;
- Sessions and History;
- Logs;
- Search;
- Settings and persistence;
- Activity Bar, menu, Command Palette and shortcuts;
- primary/secondary sidebars and Bottom Panel;
- representative loading, empty, disabled, error and destructive-confirmation states.

---

## PR sequence

Completed:

1. PR #9 — feature/readiness registry ✅
2. PR #10 — Ports workspace ✅
3. PR #11 — Sessions workspace ✅
4. PR #12 — History workspace ✅
5. PR #13 — structured Logs ✅
6. PR #14 — Workbench Search ✅
7. PR #15 — versioned Settings ✅
8. PR #18 — navigation / UX consistency ✅

Remaining:

9. Phase 8 release-gate work → `dev/master`

---

## Definition of Done

The milestone is complete only when:

- every visible Activity Bar item is implemented;
- every Bottom Panel tab contains real behavior/data;
- no clickable production control is a no-op;
- no `ready` command opens placeholder-only content;
- equivalent navigation surfaces resolve through shared command paths;
- existing SSH/SFTP/transfers/diagnostics/tunnel/session/history/log/search/settings flows remain green;
- automated release gates pass;
- Windows runtime smoke test passes;
- README describes only shipped behavior.
