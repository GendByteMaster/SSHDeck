import { invoke } from "@tauri-apps/api/core";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type PanelTab = "terminal" | "ports" | "logs" | "transfers";

export type SessionSnapshot = {
  id: string | null;
  name: string;
  state: string;
  latency: string | null;
};

type NativeLayout = {
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  panelTab: string;
  primaryWidth: number;
};

type NativeWorkspace = { layout?: NativeLayout };

type WorkbenchState = {
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  panelTab: PanelTab;
  primaryWidth: number;
  session: SessionSnapshot;
};

type WorkbenchActions = {
  setPrimaryVisible: (visible: boolean) => void;
  setSecondaryVisible: (visible: boolean) => void;
  setPanelVisible: (visible: boolean) => void;
  setPrimaryWidth: (width: number) => void;
  choosePanel: (tab: PanelTab) => void;
  setSessionSnapshot: (snapshot: SessionSnapshot) => void;
  requestAddServer: () => void;
  requestImportOpenSsh: () => void;
  requestFocusServerSearch: () => void;
  requestSelectSession: (index: number) => void;
  registerAppActions: (actions: AppActions) => void;
};

export type AppActions = {
  addServer?: () => void;
  importOpenSsh?: () => void;
  focusServerSearch?: () => void;
  selectSession?: (index: number) => void;
};

type WorkbenchContextValue = WorkbenchState & WorkbenchActions;

const defaults: WorkbenchState = {
  primaryVisible: true,
  secondaryVisible: true,
  panelVisible: false,
  panelTab: "terminal",
  primaryWidth: 320,
  session: { id: null, name: "No active session", state: "idle", latency: null },
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

function isPanelTab(value: string): value is PanelTab {
  return value === "terminal" || value === "ports" || value === "logs" || value === "transfers";
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
  const [appActions, setAppActions] = useState<AppActions>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void invoke<NativeWorkspace>("workspace_load")
      .then((workspace) => {
        if (cancelled || !workspace.layout) return;
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
    setAppActions((current) => ({ ...current, ...actions }));
  }, []);
  const choosePanel = useCallback((tab: PanelTab) => {
    setPanelTab(tab);
    setPanelVisible(true);
  }, []);
  const setPrimaryWidth = useCallback((width: number) => {
    setPrimaryWidthState(clampPrimaryWidth(width));
  }, []);

  const value = useMemo<WorkbenchContextValue>(() => ({
    primaryVisible,
    secondaryVisible,
    panelVisible,
    panelTab,
    primaryWidth,
    session,
    setPrimaryVisible,
    setSecondaryVisible,
    setPanelVisible,
    setPrimaryWidth,
    choosePanel,
    setSessionSnapshot,
    registerAppActions,
    requestAddServer: () => appActions.addServer?.(),
    requestImportOpenSsh: () => appActions.importOpenSsh?.(),
    requestFocusServerSearch: () => appActions.focusServerSearch?.(),
    requestSelectSession: (index) => appActions.selectSession?.(index),
  }), [appActions, choosePanel, panelTab, panelVisible, primaryVisible, primaryWidth, registerAppActions, secondaryVisible, session, setPrimaryWidth]);

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return value;
}
