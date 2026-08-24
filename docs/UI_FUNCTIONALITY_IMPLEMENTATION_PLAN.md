# SSHDeck UI Functionality Implementation Plan

## Goal

Bring the desktop UI and the real product behavior back into sync.

SSHDeck already has a strong Workbench shell, but some controls are visually present before their end-to-end behavior exists. The target state is simple:

> Every visible interactive control must either perform a complete user action or be clearly marked as unavailable. No enabled control may open a placeholder-only surface.

This milestone is not primarily a visual redesign. It is a behavior-completion and architecture pass.

---

## Current audit

### Working end-to-end

The following areas already have real behavior behind the UI:

- server registry: add, edit, delete, favorites, groups;
- OpenSSH import/export;
- server search/filter in the Servers sidebar;
- SSH sessions and central PTY terminal;
- session tabs, close, reconnect, next/previous/select shortcuts;
- server status, latency, auth state and uptime probes;
- SFTP Remote Files: listing, navigation, mkdir, rename, safe delete, upload/download;
- SFTP staged diagnostics;
- Transfers queue: queued/running/done/failed/cancelled, cancel/retry/clear;
- Quick Commands and dangerous-command confirmation;
- Ports workspace: local `-L`, remote `-R`, and SOCKS `-D` tunnel CRUD, start/stop, status, diagnostics, and auto-restart;
- shared tunnel lifecycle across Activity Bar, Bottom Panel, Inspector, menu, and Command Palette;
- Command Palette and keyboard shortcuts;
- Workbench primary/secondary sidebar and bottom-panel toggles;
- Workbench menu and status bar.

### Partial or planned surfaces

#### Activity Bar

Current production state:

- Servers — implemented;
- Remote Files — implemented;
- Port Forwarding — implemented;
- Transfers — implemented;
- Search — planned and hidden until implemented;
- Sessions — planned and hidden until implemented;
- History — planned and hidden until implemented;
- Settings — planned and hidden until implemented.

The Workbench no longer advertises planned product areas as clickable production controls.

#### Bottom Panel

Current production state:

- Ports — implemented;
- Transfers — implemented;
- Logs — planned and hidden until implemented;
- redundant Terminal panel — removed; the central PTY remains the terminal workspace.

#### Inspector

The Inspector is functional and currently contains several real product features:

- Server Status;
- Connection History;
- Quick Commands;
- Port Forwarding summary backed by the shared tunnel provider.

Dedicated Workbench views should continue to reuse shared state instead of creating duplicate polling or lifecycle ownership.

---

## Product rule: no dead interactions

A control is considered complete only if all of the following are true:

1. It triggers a real state transition or backend operation.
2. It has a valid empty state.
3. Long operations have loading/running state.
4. Failures are visible and actionable.
5. Runtime prerequisites are reflected in disabled/enabled state.
6. Keyboard/menu/Command Palette entry points call the same command path.
7. The behavior is covered by at least one automated check or an explicit smoke-test case.
8. No placeholder copy is rendered behind an enabled command.

---

## Architecture correction

### Feature readiness vs runtime availability

SSHDeck now separates these concepts:

```ts
type FeatureReadiness = "ready" | "experimental" | "planned";

type CommandDefinition = {
  id: CommandId;
  title: string;
  description: string;
  category: CommandCategory;
  readiness: FeatureReadiness;
  enabled: boolean;
  availabilityReason?: string;
  run: () => void | Promise<void>;
};
```

A command such as `server.connect` can be `ready` but unavailable because no server is selected. A planned feature is not exposed in production UI until its complete flow exists.

### Shared Workbench feature registry

Activity Bar and Bottom Panel visibility is derived from `workbenchFeatures.ts`.

Rules:

- `ready` and approved `experimental` features may appear in production UI;
- `planned` features remain hidden;
- `CommandService.execute` refuses planned commands;
- Command Palette, Workbench menu, native menu, context menus, shortcut reference, and keybindings respect readiness/availability;
- new product surfaces must move to `ready` only after end-to-end behavior exists.

### Shared lifecycle ownership

Subsystems with background state must have one owner. Phase 1 applies this to SSH tunnels:

```text
TunnelProvider
├── saved tunnel definitions
├── process status polling
├── start / stop
├── save / delete
├── auto-restart
└── selected tunnel integration

Consumers
├── Ports Activity workspace
├── Bottom Panel Ports
├── Inspector summary
└── CommandService
```

No consumer may create an independent tunnel polling/restart loop.

---

## Implementation phases

### Phase 0 — Interaction truthfulness + feature/view registry ✅

Completed in PR #9.

- introduced explicit `ready / experimental / planned` readiness;
- hid planned Activity Bar items;
- removed placeholder Terminal / Ports / Logs panel surfaces;
- migrated legacy panel state safely;
- separated command readiness from runtime availability.

### Phase 1 — Real Ports workspace ✅

Completed in PR #10.

Acceptance delivered:

- dedicated Activity Bar Port Forwarding workspace;
- local `-L`, remote `-R`, and SOCKS `-D` tunnel creation/editing;
- delete with stop-first behavior for running tunnels;
- start/stop controls;
- status, duration, exit reason/code, and server filtering;
- auto-restart with bounded 1s/2s/4s backoff;
- real Bottom Panel Ports view;
- Inspector consumes shared tunnel state instead of owning lifecycle;
- Ports command exposed through CommandService / View menu / Command Palette;
- one `TunnelProvider` owns process polling and restart state.

### Phase 2 — Sessions workspace

Build a dedicated Sessions workspace around the existing PTY/session lifecycle.

Required behavior:

- list all open sessions;
- active / reconnecting / disconnected / failed state;
- server identity and session duration;
- activate/focus a session;
- reconnect;
- close;
- reconnect-attempt state;
- empty/loading/error states;
- Activity Bar item becomes `ready` only when complete.

### Phase 3 — Full History workspace

Expand the existing recent Inspector history into a dedicated view.

Required behavior:

- full persisted session history;
- server/state filtering;
- exit code/signal/duration timestamps;
- reconnect from a historical server entry when available;
- bounded retention or explicit clearing policy;
- export may be added as JSON/CSV after the core flow.

### Phase 4 — Structured Logs / Diagnostics panel

Create a real Bottom Panel Logs surface.

Required behavior:

- SSH lifecycle events;
- reconnect events;
- tunnel failures/restarts;
- SFTP diagnostics;
- transfer errors;
- filtering by subsystem/severity;
- bounded in-memory retention;
- secrets/passwords/key material must never appear in logs.

### Phase 5 — Workbench Search

Search across existing SSHDeck entities, not recursively through remote files.

Initial targets:

- servers;
- sessions;
- tunnels;
- Quick Commands;
- transfers;
- commands.

Remote recursive SFTP search is intentionally separate because of latency, permissions, traversal cost, and cancellation requirements.

### Phase 6 — Versioned Settings

Create a real Settings workspace with a versioned persisted schema.

Candidate settings:

- auto-reconnect defaults;
- diagnostic timeout;
- transfer concurrency;
- destructive-command policy;
- workspace restore behavior;
- optional OpenSSH binary override.

Settings migration must be explicit when schema versions change.

### Phase 7 — Navigation / UX consistency

Audit every visible interactive control after all feature views exist.

Required checks:

- loading, empty, failure and disabled states;
- keyboard focus/navigation;
- no duplicate command implementations;
- no no-op controls;
- responsive behavior;
- consistent destructive-action confirmation;
- menu, shortcuts, Activity Bar and Command Palette use the same command routes.

### Phase 8 — Automated + Windows runtime release gate

Automated CI remains required:

- Rust format;
- Clippy;
- Rust tests;
- frontend TypeScript/Vite build;
- Tauri backend check.

Before completing the milestone, run a Windows runtime smoke test covering all ready product surfaces.

---

## Proposed PR sequence

Completed:

1. `refactor/workbench-feature-registry` — PR #9 ✅
2. `feat/ports-workspace` — PR #10 ✅

Next:

3. `feat/sessions-workspace`
4. `feat/history-workspace`
5. `feat/workbench-logs`
6. `feat/workbench-search`
7. `feat/settings-workspace`
8. `fix/ui-interaction-consistency`

Each feature PR must target `dev/master`, pass CI, and avoid introducing visible controls whose complete flow is not yet implemented.

---

## Definition of Done

This milestone is complete only when:

- every Activity Bar item is implemented or intentionally absent from production UI;
- every Bottom Panel tab contains real behavior/data;
- no clickable control is a no-op;
- no `ready` command opens placeholder-only content;
- menu/Command Palette/shortcuts/buttons resolve through shared command paths;
- existing SSH/SFTP/transfers/diagnostics/tunnel flows remain green;
- Windows runtime smoke test passes;
- README describes only shipped behavior.
