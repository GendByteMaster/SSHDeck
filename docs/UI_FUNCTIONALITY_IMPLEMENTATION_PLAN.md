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
- tunnel create/start/stop/delete, health state and auto-restart in the Inspector;
- Command Palette and keyboard shortcuts;
- Workbench primary/secondary sidebar and bottom-panel toggles;
- Workbench menu and status bar.

### Partial or misleading surfaces

#### Activity Bar

Current state:

- Servers — implemented;
- Remote Files — implemented;
- Search — disabled / not implemented as a Workbench view;
- Port Forwarding — disabled even though tunnel functionality exists elsewhere;
- Sessions — disabled even though active session tabs exist;
- History — disabled even though recent session history exists in the Inspector;
- Transfers — implemented;
- Settings — disabled / not implemented.

The issue is not that every item is enabled. The issue is that the Workbench visually advertises product areas that do not yet have a complete navigation destination.

#### Bottom Panel

Current state:

- Transfers — implemented;
- Terminal — enabled but placeholder-only;
- Ports — enabled but placeholder-only;
- Logs — enabled but placeholder-only.

This is the highest-priority UI correctness problem because these commands are reported as enabled in the command registry while their panel body is only explanatory copy.

#### Inspector

The Inspector is functional and currently contains several real product features:

- Server Status;
- Connection History;
- Quick Commands;
- Port Forwarding.

This existing functionality should be reused and extracted instead of duplicated when dedicated Workbench views are introduced.

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

### Problem

`CommandDefinition.enabled` currently answers two different questions:

- is this product capability implemented?
- can this command run in the current runtime state?

These must be separate concepts.

A command such as `server.connect` may be fully implemented but disabled because no server is selected. That is different from a planned feature such as the current Search Activity item.

### Target model

Introduce explicit feature readiness and runtime availability.

Suggested shape:

```ts
type FeatureReadiness = "ready" | "experimental" | "planned";

type CommandAvailability = {
  enabled: boolean;
  reason?: string;
};

type CommandDefinition = {
  id: CommandId;
  title: string;
  description: string;
  category: CommandCategory;
  shortcut?: string;
  readiness: FeatureReadiness;
  availability: CommandAvailability;
  run: () => void | Promise<void>;
};
```

Do not use `enabled: true` for placeholder navigation.

### View registry

The Activity Bar should not maintain its own hard-coded `enabled` flags independently from the command system.

Introduce a small Workbench view registry:

```ts
type WorkbenchViewDefinition = {
  id: WorkbenchViewId;
  label: string;
  command: CommandId;
  readiness: FeatureReadiness;
  location: "activity" | "panel" | "secondary";
};
```

The Activity Bar, menu, Command Palette and shortcuts should resolve availability from shared definitions.

This prevents four different UI surfaces from disagreeing about whether a feature exists.

---

# Implementation phases

## Phase 0 — Interaction truthfulness and registry

### Scope

- separate feature readiness from runtime availability;
- introduce shared Workbench view definitions;
- remove enabled placeholder commands;
- remove or hide placeholder-only panel tabs until their real implementation lands;
- add disabled reasons/tooltips for commands that are implemented but unavailable because of state;
- add a development assertion/test that no `ready` navigation command resolves to a placeholder component.

### Important decision: remove Bottom Panel `Terminal`

Do **not** build a second terminal just to make the button work.

The central workspace already owns the real PTY terminal. A second bottom-panel Terminal would duplicate session ownership, focus handling, resizing and lifecycle semantics.

For now:

- remove the Bottom Panel `Terminal` tab and command;
- keep the central PTY as the single interactive terminal surface;
- if a future local shell/console is needed, introduce it as a different product concept with a separate specification.

### Acceptance criteria

- no enabled UI action opens placeholder text;
- every disabled action explains why it is disabled or is hidden when purely planned;
- Activity Bar and Command Palette use the same readiness source;
- central terminal remains the only PTY interaction surface.

---

## Phase 1 — Real Ports workspace

Port forwarding already exists in `ToolsPanel`; the implementation should be extracted rather than rewritten.

### Scope

Create reusable tunnel state/hooks/components and use them in both Inspector and dedicated Ports surfaces.

Dedicated Ports view/panel must support:

- list tunnels;
- create local (`-L`), remote (`-R`) and dynamic (`-D`) tunnels;
- start/stop;
- edit/delete when stopped;
- current process state;
- duration;
- exit code/error;
- health diagnostics;
- auto-restart toggle and retry state;
- filtering by selected server;
- explicit empty/error/loading states.

Wire:

- Activity Bar `Port Forwarding`;
- Bottom Panel `Ports`;
- top menu / Command Palette commands;
- existing Inspector tunnel controls.

All entry points must operate on one tunnel store, not independent local copies.

### Acceptance criteria

- Activity Bar Ports opens a real workspace;
- Bottom Panel Ports renders real tunnel state;
- state changes are immediately reflected in Inspector and panel;
- no duplicate tunnel process polling loops are introduced.

---

## Phase 2 — Sessions workspace

The current tab strip is good for switching between a few active sessions, but it is not a session-management view.

### Scope

Create a Sessions workspace that shows all current session records with:

- active/reconnecting/disconnected/failed state;
- server name and target;
- start time and duration;
- auto-reconnect state;
- reconnect attempts;
- exit code/signal when ended;
- select/focus session;
- reconnect;
- close;
- close all disconnected sessions;
- optional filter by state/server.

Wire Activity Bar `Sessions` to this view.

The existing central SessionTabs remain the fast switcher; the Sessions workspace becomes the management surface.

### Acceptance criteria

- Activity Bar Sessions is enabled;
- actions update the central terminal/tab state immediately;
- commands and shortcuts still use the same lifecycle methods;
- empty state is meaningful when there are no sessions.

---

## Phase 3 — Full History workspace

The Inspector currently shows only a small recent subset. Keep that compact summary, but add a dedicated History view.

### Scope

- full persisted session history;
- filter by server, state and date/time;
- reconnect/open server from a history row;
- duration, exit code, signal and reconnect outcome;
- clear history with confirmation;
- export history to JSON/CSV only after the persisted model is stable.

Wire Activity Bar `History` to this view.

### Acceptance criteria

- Activity Bar History is enabled;
- Inspector remains a compact five-item summary;
- both surfaces read the same history store;
- clear/export actions cannot silently lose data.

---

## Phase 4 — Logs and Diagnostics panel

The current Bottom Panel `Logs` is placeholder copy. Replace it with a structured local event stream.

### Event classes

At minimum:

- session start/connected/disconnected/reconnect/close;
- SSH status probes;
- SFTP diagnostics;
- tunnel start/stop/failure/auto-restart;
- transfer start/done/failure/cancel;
- command-safety confirmation/rejection events without logging secrets.

### Log model

```ts
type WorkbenchLogEntry = {
  id: string;
  atMs: number;
  level: "info" | "warning" | "error";
  source: "session" | "ssh" | "sftp" | "tunnel" | "transfer" | "command";
  serverId?: string;
  sessionId?: string;
  message: string;
  detail?: string;
};
```

### UI

- filter by level/source/server/session;
- copy one entry;
- copy visible entries;
- clear local view;
- bounded retention to avoid unbounded memory growth;
- never record passwords/private keys/raw secret values.

### Acceptance criteria

- Bottom Panel Logs contains real events;
- SFTP diagnostics and tunnel failures appear there;
- logs do not expose credentials;
- retention is bounded and tested.

---

## Phase 5 — Workbench Search

Do not implement remote-file content search as part of this phase. That is a separate SFTP feature with very different cost and permissions.

### Scope

Global local entity search across:

- servers;
- active/recent sessions;
- tunnels;
- Quick Commands;
- transfers;
- commands/actions.

Results are grouped by entity type and execute the canonical command/action when selected.

The existing server filter remains a lightweight filter inside the Servers view.

### Acceptance criteria

- Activity Bar Search opens a dedicated search surface;
- results update while typing;
- selecting a result navigates to/focuses the correct entity;
- no remote recursive filesystem scan is triggered.

---

## Phase 6 — Settings

Create a versioned local application settings model rather than scattering `localStorage` flags through components.

### Initial settings

Only include settings with real product behavior:

- default auto-reconnect;
- SSH/SFTP diagnostic timeout;
- transfer concurrency limit;
- destructive-command confirmation policy;
- default behavior after starting a transfer (open panel or stay in browser);
- preferred initial Workbench view;
- restore previous workspace layout/session tabs where safe;
- OpenSSH binary override only if automatic discovery fails.

Do not add cosmetic settings merely to fill the page.

### Persistence

Use a schema-versioned local settings object with migration support.

### Acceptance criteria

- Settings Activity item is enabled;
- changing a setting changes real behavior immediately or after an explicitly documented restart;
- invalid persisted values fall back safely;
- migrations are tested.

---

## Phase 7 — Navigation and UX consistency

Once all primary surfaces are real, normalize behavior.

### Scope

- consistent empty/loading/error states;
- consistent toolbar placement;
- consistent destructive confirmations;
- consistent selected-server/session propagation;
- badges/counts for Sessions, Transfers and failing tunnels where useful;
- focus restoration after dialogs/dropdowns;
- keyboard navigation for Activity Bar and panel tabs;
- no duplicate actions with different semantics;
- remove stale explanatory/placeholder copy.

---

## Phase 8 — Test and release gate

### Automated

Add or extend tests for:

- command readiness vs runtime availability;
- view registry consistency;
- session view actions;
- tunnel store synchronization;
- history filtering/persistence;
- log redaction/retention;
- settings migration;
- frontend build and Tauri check.

### Runtime smoke matrix

At minimum on Windows before promotion to `main`:

1. every Activity Bar item opens a real destination;
2. every top-menu command either runs or is correctly disabled;
3. every Bottom Panel tab contains real data/behavior;
4. no clickable control is a no-op;
5. SFTP errors still produce diagnostics;
6. transfers still cancel/retry;
7. tunnels start/stop and stay synchronized across surfaces;
8. session tabs and Sessions workspace stay synchronized;
9. layout resize/collapse state survives expected restarts;
10. no secrets appear in logs/errors.

Linux/macOS packaging smoke tests follow once platform packaging is part of the release gate.

---

# Proposed PR sequence

Keep each change independently reviewable and merge into `dev/master` only after CI is green.

1. `refactor/workbench-feature-registry`
   - readiness/availability split;
   - shared view registry;
   - remove Bottom Terminal placeholder;
   - remove enabled placeholder panel behavior.

2. `feat/ports-workspace`
   - extract shared tunnel store;
   - real Ports Activity/Panel view.

3. `feat/sessions-workspace`
   - full session management view.

4. `feat/history-workspace`
   - full history view and persisted operations.

5. `feat/workbench-logs`
   - structured logs/diagnostics panel.

6. `feat/workbench-search`
   - local entity search.

7. `feat/settings-workspace`
   - versioned behavior settings.

8. `fix/ui-interaction-consistency`
   - final interaction audit, accessibility, empty/loading/error consistency and Windows runtime smoke fixes.

Do not combine these into one large PR.

---

# Definition of Done for this milestone

The milestone is complete when:

- every Activity Bar item is either implemented or intentionally absent from the production UI;
- every Bottom Panel tab is functional;
- every visible button performs a real action or has a clear disabled reason;
- Command Palette, menu, shortcuts and visible buttons resolve through the same command/action paths;
- no production component contains placeholder-only content behind a ready command;
- existing SSH, SFTP, transfers, diagnostics, Quick Commands and tunnels regressions remain green;
- Windows runtime smoke test passes;
- README reflects only functionality that actually ships.
