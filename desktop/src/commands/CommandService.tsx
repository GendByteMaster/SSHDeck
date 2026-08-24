import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { useWorkbench } from "../WorkbenchContext";

export type CommandId =
  | "workbench.commandPalette.open"
  | "workbench.shortcuts.open"
  | "workbench.primarySidebar.toggle"
  | "workbench.secondarySidebar.toggle"
  | "workbench.panel.toggle"
  | "workbench.panel.terminal"
  | "workbench.panel.ports"
  | "workbench.panel.logs"
  | "workbench.panel.transfers"
  | "server.add"
  | "server.importOpenSsh"
  | "server.focusSearch"
  | "server.connect"
  | "server.edit"
  | "server.exportOpenSsh"
  | "server.delete"
  | "session.next"
  | "session.previous"
  | "session.close"
  | "session.reconnect"
  | "session.select.1"
  | "session.select.2"
  | "session.select.3"
  | "session.select.4"
  | "session.select.5"
  | "session.select.6"
  | "session.select.7"
  | "session.select.8"
  | "session.select.9";

export type CommandCategory = "Workbench" | "Servers" | "Sessions" | "Panel";

export type CommandDefinition = {
  id: CommandId;
  title: string;
  description: string;
  category: CommandCategory;
  shortcut?: string;
  enabled: boolean;
  run: () => void | Promise<void>;
};

type CommandContextValue = {
  commands: CommandDefinition[];
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  execute: (id: CommandId) => Promise<boolean>;
  getCommand: (id: CommandId) => CommandDefinition | undefined;
};

const CommandContext = createContext<CommandContextValue | null>(null);

const sessionCommandIds: CommandId[] = [
  "session.select.1",
  "session.select.2",
  "session.select.3",
  "session.select.4",
  "session.select.5",
  "session.select.6",
  "session.select.7",
  "session.select.8",
  "session.select.9",
];

export function CommandProvider({ children }: { children: ReactNode }) {
  const workbench = useWorkbench();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const commands = useMemo<CommandDefinition[]>(() => {
    const hasSession = workbench.session.id !== null;
    const hasSelectedServer = workbench.selectedServer.id !== null;

    const fixed: CommandDefinition[] = [
      {
        id: "workbench.commandPalette.open",
        title: "Show Command Palette",
        description: "Search and run SSHDeck commands",
        category: "Workbench",
        shortcut: "Ctrl+Shift+P",
        enabled: true,
        run: () => setPaletteOpen((value) => !value),
      },
      {
        id: "workbench.shortcuts.open",
        title: "Show Keyboard Shortcuts",
        description: "Open the desktop keybinding reference",
        category: "Workbench",
        shortcut: "F1",
        enabled: true,
        run: () => setShortcutsOpen((value) => !value),
      },
      {
        id: "server.add",
        title: "Add Server",
        description: "Create a new SSHDeck server entry",
        category: "Servers",
        shortcut: "Ctrl+Shift+N",
        enabled: true,
        run: workbench.requestAddServer,
      },
      {
        id: "server.importOpenSsh",
        title: "Import OpenSSH",
        description: "Import aliases from your OpenSSH config",
        category: "Servers",
        enabled: true,
        run: workbench.requestImportOpenSsh,
      },
      {
        id: "server.focusSearch",
        title: "Focus Server Search",
        description: "Move focus to the server filter",
        category: "Servers",
        shortcut: "Ctrl+Shift+K",
        enabled: workbench.primaryVisible,
        run: workbench.requestFocusServerSearch,
      },
      {
        id: "server.connect",
        title: "Connect Selected Server",
        description: hasSelectedServer ? `Open an SSH session to ${workbench.selectedServer.name}` : "Select a server first",
        category: "Servers",
        enabled: hasSelectedServer,
        run: workbench.requestConnectSelectedServer,
      },
      {
        id: "server.edit",
        title: "Edit Selected Server",
        description: hasSelectedServer ? `Edit ${workbench.selectedServer.name}` : "Select a server first",
        category: "Servers",
        enabled: hasSelectedServer,
        run: workbench.requestEditSelectedServer,
      },
      {
        id: "server.exportOpenSsh",
        title: "Export Selected Server",
        description: hasSelectedServer ? `Copy OpenSSH config for ${workbench.selectedServer.name}` : "Select a server first",
        category: "Servers",
        enabled: hasSelectedServer,
        run: workbench.requestExportSelectedServer,
      },
      {
        id: "server.delete",
        title: "Delete Selected Server",
        description: hasSelectedServer ? `Remove ${workbench.selectedServer.name} from SSHDeck` : "Select a server first",
        category: "Servers",
        enabled: hasSelectedServer,
        run: workbench.requestDeleteSelectedServer,
      },
      {
        id: "session.next",
        title: "Next Session",
        description: "Activate the next SSH session tab",
        category: "Sessions",
        shortcut: "Ctrl+Tab",
        enabled: hasSession,
        run: workbench.requestNextSession,
      },
      {
        id: "session.previous",
        title: "Previous Session",
        description: "Activate the previous SSH session tab",
        category: "Sessions",
        shortcut: "Ctrl+Shift+Tab",
        enabled: hasSession,
        run: workbench.requestPreviousSession,
      },
      {
        id: "session.close",
        title: "Close Active Session",
        description: hasSession ? `Close ${workbench.session.name}` : "No active SSH session",
        category: "Sessions",
        shortcut: "Ctrl+Shift+W",
        enabled: hasSession,
        run: workbench.requestCloseSession,
      },
      {
        id: "session.reconnect",
        title: "Reconnect Active Session",
        description: hasSession ? `Reconnect ${workbench.session.name}` : "No active SSH session",
        category: "Sessions",
        shortcut: "Ctrl+Shift+R",
        enabled: hasSession,
        run: workbench.requestReconnectSession,
      },
      {
        id: "workbench.primarySidebar.toggle",
        title: "Toggle Servers Sidebar",
        description: "Show or hide the primary server sidebar",
        category: "Workbench",
        shortcut: "Ctrl+B",
        enabled: true,
        run: () => workbench.setPrimaryVisible(!workbench.primaryVisible),
      },
      {
        id: "workbench.secondarySidebar.toggle",
        title: "Toggle Inspector",
        description: "Show or hide the contextual inspector",
        category: "Workbench",
        shortcut: "Ctrl+Alt+B",
        enabled: true,
        run: () => workbench.setSecondaryVisible(!workbench.secondaryVisible),
      },
      {
        id: "workbench.panel.toggle",
        title: "Toggle Bottom Panel",
        description: "Show or hide the bottom workbench panel",
        category: "Workbench",
        shortcut: "Ctrl+J",
        enabled: true,
        run: () => workbench.setPanelVisible(!workbench.panelVisible),
      },
      {
        id: "workbench.panel.terminal",
        title: "Show Terminal Panel",
        description: "Open the Terminal section of the bottom panel",
        category: "Panel",
        enabled: true,
        run: () => workbench.choosePanel("terminal"),
      },
      {
        id: "workbench.panel.ports",
        title: "Show Ports Panel",
        description: "Open managed SSH port forwarding",
        category: "Panel",
        enabled: true,
        run: () => workbench.choosePanel("ports"),
      },
      {
        id: "workbench.panel.logs",
        title: "Show Logs Panel",
        description: "Open SSH session diagnostics",
        category: "Panel",
        enabled: true,
        run: () => workbench.choosePanel("logs"),
      },
      {
        id: "workbench.panel.transfers",
        title: "Show Transfers Panel",
        description: "Open the transfer queue",
        category: "Panel",
        enabled: true,
        run: () => workbench.choosePanel("transfers"),
      },
    ];

    const sessions = sessionCommandIds.map((id, index): CommandDefinition => ({
      id,
      title: `Select Session ${index + 1}`,
      description: `Activate SSH session tab ${index + 1}`,
      category: "Sessions",
      shortcut: `Ctrl+${index + 1}`,
      enabled: hasSession,
      run: () => workbench.requestSelectSession(index),
    }));

    return [...fixed, ...sessions];
  }, [
    workbench.choosePanel,
    workbench.panelVisible,
    workbench.primaryVisible,
    workbench.requestAddServer,
    workbench.requestCloseSession,
    workbench.requestConnectSelectedServer,
    workbench.requestDeleteSelectedServer,
    workbench.requestEditSelectedServer,
    workbench.requestExportSelectedServer,
    workbench.requestFocusServerSearch,
    workbench.requestImportOpenSsh,
    workbench.requestNextSession,
    workbench.requestPreviousSession,
    workbench.requestReconnectSession,
    workbench.requestSelectSession,
    workbench.secondaryVisible,
    workbench.selectedServer.id,
    workbench.selectedServer.name,
    workbench.session.id,
    workbench.session.name,
    workbench.setPanelVisible,
    workbench.setPrimaryVisible,
    workbench.setSecondaryVisible,
  ]);

  const commandMap = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands]);

  const value = useMemo<CommandContextValue>(() => ({
    commands,
    paletteOpen,
    shortcutsOpen,
    setPaletteOpen,
    setShortcutsOpen,
    getCommand: (id) => commandMap.get(id),
    execute: async (id) => {
      const command = commandMap.get(id);
      if (!command?.enabled) return false;
      await command.run();
      return true;
    },
  }), [commandMap, commands, paletteOpen, shortcutsOpen]);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useCommands() {
  const value = useContext(CommandContext);
  if (!value) throw new Error("useCommands must be used inside CommandProvider");
  return value;
}
