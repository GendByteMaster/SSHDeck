import { invoke } from "@tauri-apps/api/core";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type PanelTab = "ports" | "logs" | "transfers";

export type SessionSnapshot = {
  id: string | null;
  name: string;
  state: string;
  latency: string | null;
};

export type ServerSelection = {
  id: string | null;
  name: string;
};

export type TunnelSelection = {
  id: string | null;
  name: string;
  state: string;
};

type NativeLayout = {
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  panelTab: string;
  primaryWidth: number;
};

type NativeWorkspace = {
  layout?: NativeLayout;
  settings?: { restoreWorkspaceLayout?: boolean };
};

type WorkbenchState = {
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  panelTab: PanelTab;
  primaryWidth: number;
  session: SessionSnapshot;
  selectedServer: ServerSelection;
  selectedTunnel: TunnelSelection;
};

type WorkbenchActions = {
  setPrimaryVisible: (visible: boolean) => void;
  setSecondaryVisible: (visible: boolean) => void;
  setPanelVisible: (visible: boolean) => void;
  setPrimaryWidth: (width: number) => void;
  choosePanel: (tab: PanelTab) => void;
  setSessionSnapshot: (snapshot: SessionSnapshot) => void;
  setSelectedServer: (selection: ServerSelection) => void;
  setSelectedTunnel: (selection: TunnelSelection) => void;
  requestAddServer: () => void;
  requestImportOpenSsh: () => void;
  requestFocusServerSearch: () => void;
  requestShowSearchWorkspace: () => void;
  requestShowSessionsWorkspace: () => void;
  requestShowHistoryWorkspace: () => void;
  requestShowSettingsWorkspace: () => void;
  requestSelectSession: (index: number) => void;
  requestNextSession: () => void;
  requestPreviousSession: () => void;
  requestCloseSession: () => void;
  requestReconnectSession: () => void;
  requestConnectSelectedServer: () => void;
  requestEditSelectedServer: () => void;
  requestExportSelectedServer: () => void;
  requestDeleteSelectedServer: () => void;
  requestStartSelectedTunnel: () => void;
  requestStopSelectedTunnel: () => void;
  registerAppActions: (actions: AppActions) => void;
};

export type AppActions = {
  addServer?: () => void;
  importOpenSsh?: () => void;
  focusServerSearch?: () => void;
  showSearchWorkspace?: () => void;
  showSessionsWorkspace?: () => void;
  showHistoryWorkspace?: () => void;
  showSettingsWorkspace?: () => void;
  selectSession?: (index: number) => void;
  nextSession?: () => void;
  previousSession?: () => void;
  closeSession?: () => void;
  reconnectSession?: () => void;
  connectServer?: (serverId: string) => void;
  editServer?: (serverId: string) => void;
  exportServer?: (serverId: string) => void;
  deleteServer?: (serverId: string) => void;
  startTunnel?: (tunnelId: string) => void;
  stopTunnel?: (tunnelId: string) => void;
};

type WorkbenchContextValue = WorkbenchState & WorkbenchActions;

const defaults: WorkbenchState = {
  primaryVisible: true,
  secondaryVisible: true,
  panelVisible: false,
  panelTab: "transfers",
  primaryWidth: 320,
  session: { id: null, name: "No active session", state: "idle", latency: null },
  selectedServer: { id: null, name: "No server selected" },
  selectedTunnel: { id: null, name: "No tunnel selected", state: "stopped" },
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

function isPanelTab(value: string): value is PanelTab {
  return value === "ports" || value === "logs" || value === "transfers";
}

function clampPrimaryWidth(value: number) {
  return Math.min(520, Math.max(280, Math.round(value || defaults.primaryWidth)));
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [primaryVisible, setPrimaryVisible] = useState(defaults.primaryVisible);
  const [secondaryVisible, setSecondaryVisible] = useState(defaults.secondaryVisible);
  const [panelVisible, setPanelVisible] = useState(defaults.panelVisible);
  const [panelTab, setPanelTab] = useState<PanelTab>(defaults.panelTab);
  const [primaryWidth, setPrimaryWidthState] = useState(defaults.primaryWidth);
  const [session, setSessionSnapshot] = useState<SessionSnapshot>(defaults.session);
  const [selectedServer, setSelectedServer] = useState<ServerSelection>(defaults.selectedServer);
  const [selectedTunnel, setSelectedTunnel] = useState<TunnelSelection>(defaults.selectedTunnel);
  const appActions = useRef<AppActions>({});
  const skipInitialLayoutSave = useRef(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void invoke<NativeWorkspace>("workspace_load")
      .then((workspace) => {
        if (cancelled || !workspace.layout || workspace.settings?.restoreWorkspaceLayout === false) return;
        const layout = workspace.layout;
        setPrimaryVisible(layout.primaryVisible);
        setSecondaryVisible(layout.secondaryVisible);
        setPanelVisible(layout.panelVisible);
        setPanelTab(isPanelTab(layout.panelTab) ? layout.panelTab : defaults.panelTab);
        setPrimaryWidthState(clampPrimaryWidth(layout.primaryWidth));
      })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipInitialLayoutSave.current) {
      skipInitialLayoutSave.current = false;
      return;
    }
    const layout: NativeLayout = {
      primaryVisible,
      secondaryVisible,
      panelVisible,
      panelTab,
      primaryWidth,
    };
    void invoke("workspace_save_layout", { layout });
  }, [hydrated, panelTab, panelVisible, primaryVisible, primaryWidth, secondaryVisible]);

  const registerAppActions = useCallback((actions: AppActions) => {
    appActions.current = { ...appActions.current, ...actions };
  }, []);
  const choosePanel = useCallback((tab: PanelTab) => {
    setPanelTab(tab);
    setPanelVisible(true);
  }, []);
  const setPrimaryWidth = useCallback((width: number) => {
    setPrimaryWidthState(clampPrimaryWidth(width));
  }, []);

  const requestAddServer = useCallback(() => appActions.current.addServer?.(), []);
  const requestImportOpenSsh = useCallback(() => appActions.current.importOpenSsh?.(), []);
  const requestFocusServerSearch = useCallback(() => appActions.current.focusServerSearch?.(), []);
  const requestShowSearchWorkspace = useCallback(() => {
    setPrimaryVisible(true);
    appActions.current.showSearchWorkspace?.();
  }, []);
  const requestShowSessionsWorkspace = useCallback(() => {
    setPrimaryVisible(true);
    appActions.current.showSessionsWorkspace?.();
  }, []);
  const requestShowHistoryWorkspace = useCallback(() => {
    setPrimaryVisible(true);
    appActions.current.showHistoryWorkspace?.();
  }, []);
  const requestShowSettingsWorkspace = useCallback(() => {
    setPrimaryVisible(true);
    appActions.current.showSettingsWorkspace?.();
  }, []);
  const requestSelectSession = useCallback((index: number) => appActions.current.selectSession?.(index), []);
  const requestNextSession = useCallback(() => appActions.current.nextSession?.(), []);
  const requestPreviousSession = useCallback(() => appActions.current.previousSession?.(), []);
  const requestCloseSession = useCallback(() => appActions.current.closeSession?.(), []);
  const requestReconnectSession = useCallback(() => appActions.current.reconnectSession?.(), []);
  const requestConnectSelectedServer = useCallback(() => {
    if (selectedServer.id) appActions.current.connectServer?.(selectedServer.id);
  }, [selectedServer.id]);
  const requestEditSelectedServer = useCallback(() => {
    if (selectedServer.id) appActions.current.editServer?.(selectedServer.id);
  }, [selectedServer.id]);
  const requestExportSelectedServer = useCallback(() => {
    if (selectedServer.id) appActions.current.exportServer?.(selectedServer.id);
  }, [selectedServer.id]);
  const requestDeleteSelectedServer = useCallback(() => {
    if (selectedServer.id) appActions.current.deleteServer?.(selectedServer.id);
  }, [selectedServer.id]);
  const requestStartSelectedTunnel = useCallback(() => {
    if (selectedTunnel.id) appActions.current.startTunnel?.(selectedTunnel.id);
  }, [selectedTunnel.id]);
  const requestStopSelectedTunnel = useCallback(() => {
    if (selectedTunnel.id) appActions.current.stopTunnel?.(selectedTunnel.id);
  }, [selectedTunnel.id]);

  const value = useMemo<WorkbenchContextValue>(() => ({
    primaryVisible,
    secondaryVisible,
    panelVisible,
    panelTab,
    primaryWidth,
    session,
    selectedServer,
    selectedTunnel,
    setPrimaryVisible,
    setSecondaryVisible,
    setPanelVisible,
    setPrimaryWidth,
    choosePanel,
    setSessionSnapshot,
    setSelectedServer,
    setSelectedTunnel,
    registerAppActions,
    requestAddServer,
    requestImportOpenSsh,
    requestFocusServerSearch,
    requestShowSearchWorkspace,
    requestShowSessionsWorkspace,
    requestShowHistoryWorkspace,
    requestShowSettingsWorkspace,
    requestSelectSession,
    requestNextSession,
    requestPreviousSession,
    requestCloseSession,
    requestReconnectSession,
    requestConnectSelectedServer,
    requestEditSelectedServer,
    requestExportSelectedServer,
    requestDeleteSelectedServer,
    requestStartSelectedTunnel,
    requestStopSelectedTunnel,
  }), [
    choosePanel,
    panelTab,
    panelVisible,
    primaryVisible,
    primaryWidth,
    registerAppActions,
    requestAddServer,
    requestCloseSession,
    requestConnectSelectedServer,
    requestDeleteSelectedServer,
    requestEditSelectedServer,
    requestExportSelectedServer,
    requestFocusServerSearch,
    requestImportOpenSsh,
    requestNextSession,
    requestPreviousSession,
    requestReconnectSession,
    requestSelectSession,
    requestShowHistoryWorkspace,
    requestShowSearchWorkspace,
    requestShowSessionsWorkspace,
    requestShowSettingsWorkspace,
    requestStartSelectedTunnel,
    requestStopSelectedTunnel,
    secondaryVisible,
    selectedServer,
    selectedTunnel,
    session,
    setPrimaryWidth,
  ]);

  const rootClassName = [
    "h-full w-full",
    !primaryVisible ? "wb-primary-hidden" : "",
    !secondaryVisible ? "wb-secondary-hidden" : "",
    panelVisible ? "wb-panel-open" : "",
  ].filter(Boolean).join(" ");

  return <WorkbenchContext.Provider value={value}><div className={rootClassName}>{children}</div></WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return value;
}
