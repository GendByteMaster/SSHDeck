import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(desktopRoot, path), "utf8");

const source = {
  features: read("src/workbenchFeatures.ts"),
  commands: read("src/commands/CommandService.tsx"),
  keybindings: read("src/commands/KeybindingService.tsx"),
  sidebar: read("src/SidebarV2.tsx"),
  workbench: read("src/WorkbenchContext.tsx"),
  chrome: read("src/WorkbenchChrome.tsx"),
  palette: read("src/CommandPalette.tsx"),
  search: read("src/SearchWorkspace.tsx"),
  tools: read("src/ToolsPanel.tsx"),
};

let checks = 0;

function contains(label, haystack, needle) {
  checks += 1;
  assert.ok(haystack.includes(needle), `${label}: expected to find ${JSON.stringify(needle)}`);
}

function notContains(label, haystack, needle) {
  checks += 1;
  assert.ok(!haystack.includes(needle), `${label}: unexpected ${JSON.stringify(needle)}`);
}

const activityCommands = {
  servers: "workbench.view.servers",
  sftp: "workbench.view.sftp",
  search: "workbench.view.search",
  ports: "workbench.view.ports",
  sessions: "workbench.view.sessions",
  history: "workbench.view.history",
  transfers: "workbench.panel.transfers",
  settings: "workbench.view.settings",
};

for (const [feature, command] of Object.entries(activityCommands)) {
  contains(`activity feature ${feature}`, source.features, `id: "${feature}"`);
  contains(`activity command ${command}`, source.commands, `id: "${command}"`);
  contains(`activity route ${feature}`, source.sidebar, `${feature}: "${command}"`);
}

const panelCommands = {
  ports: "workbench.panel.ports",
  logs: "workbench.panel.logs",
  transfers: "workbench.panel.transfers",
};

for (const [feature, command] of Object.entries(panelCommands)) {
  contains(`panel feature ${feature}`, source.features, `id: "${feature}"`);
  contains(`panel command ${command}`, source.commands, `id: "${command}"`);
  contains(`panel route ${feature}`, source.chrome, `${feature}: "${command}"`);
}

// The central PTY is the only terminal surface. A second panel command must not return.
notContains("no duplicate terminal panel command", source.commands, "workbench.panel.terminal");
notContains("no duplicate terminal panel route", source.chrome, "workbench.panel.terminal");

// Phase 7 made primary workspace selection a shared Workbench concern.
contains("shared primary view state", source.workbench, "const [primaryView, setPrimaryView]");
contains("shared primary view helper", source.workbench, "const showPrimaryView = useCallback((view: PrimaryView) => {");
contains("shared primary view reveals sidebar", source.workbench, "setPrimaryVisible(true);");
contains("shared primary view selects destination", source.workbench, "setPrimaryView(view);");
contains("Sidebar consumes shared primary view", source.sidebar, "primaryView: view");
notContains("Sidebar has no private primary view state", source.sidebar, "useState<SidebarView>");
contains("Activity Bar executes shared commands", source.sidebar, "execute(activityCommand[id])");
contains("Bottom Panel executes shared commands", source.chrome, "execute(panelCommand[id])");

// Server-search focus must use the shared Servers route before the deferred DOM focus request runs.
contains("server search uses shared Servers workspace route", source.workbench, "showPrimaryView(\"servers\")");
contains("server search delegates DOM focus", source.workbench, "appActions.current.focusServerSearch?.()");
contains("server search defers DOM focus", source.sidebar, "requestAnimationFrame(() =>");

// Ready-but-unavailable commands remain discoverable and explain why they cannot run.
contains("palette exposes availability reason", source.palette, "item.availabilityReason");
notContains(
  "palette does not hide disabled ready commands",
  source.palette,
  "command.readiness !== \"planned\" && command.enabled",
);
contains("command execution still refuses disabled commands", source.commands, "!command.enabled) return false");

// Keyboard shortcuts declared in CommandService must have real keybinding handlers.
for (const command of [
  "workbench.commandPalette.open",
  "workbench.shortcuts.open",
  "workbench.view.search",
  "workbench.view.settings",
  "server.focusSearch",
  "session.next",
  "session.previous",
  "session.close",
  "session.reconnect",
  "workbench.primarySidebar.toggle",
  "workbench.secondarySidebar.toggle",
  "workbench.panel.toggle",
]) {
  contains(`keybinding ${command}`, source.keybindings, `command: "${command}"`);
}

// Cross-view navigation must reuse command routing instead of calling panel state directly.
contains("Search opens Ports via command", source.search, "execute(\"workbench.panel.ports\")");
contains("Search opens Transfers via command", source.search, "execute(\"workbench.panel.transfers\")");
contains("Inspector opens Ports via command", source.tools, "execute(\"workbench.panel.ports\")");
notContains("Search does not own panel navigation", source.search, "choosePanel(");
notContains("Inspector does not own panel navigation", source.tools, "choosePanel(");

console.log(`UI contract checks passed: ${checks}`);
