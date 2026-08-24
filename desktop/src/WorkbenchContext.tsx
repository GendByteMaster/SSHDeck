import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type PanelTab = "terminal" | "ports" | "logs" | "transfers";

export type SessionSnapshot = {
  id: string | null;
  name: string;
  state: string;
  latency: string | null;
};

type WorkbenchState = {
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  panelTab: PanelTab;
  session: SessionSnapshot;
};

type WorkbenchActions = {
  setPrimaryVisible: (visible: boolean) => void;
  setSecondaryVisible: (visible: boolean) => void;
  setPanelVisible: (visible: boolean) => void;
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
  session: { id: null, name: "No active session", state: "idle", latency: null },
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [primaryVisible, setPrimaryVisible] = useState(defaults.primaryVisible);
  const [secondaryVisible, setSecondaryVisible] = useState(defaults.secondaryVisible);
  const [panelVisible, setPanelVisible] = useState(defaults.panelVisible);
  const [panelTab, setPanelTab] = useState<PanelTab>(defaults.panelTab);
  const [session, setSessionSnapshot] = useState<SessionSnapshot>(defaults.session);
  const [appActions, setAppActions] = useState<AppActions>({});

  const registerAppActions = useCallback((actions: AppActions) => {
    setAppActions((current) => ({ ...current, ...actions }));
  }, []);
  const choosePanel = useCallback((tab: PanelTab) => {
    setPanelTab(tab);
    setPanelVisible(true);
  }, []);

  const value = useMemo<WorkbenchContextValue>(() => ({
    primaryVisible,
    secondaryVisible,
    panelVisible,
    panelTab,
    session,
    setPrimaryVisible,
    setSecondaryVisible,
    setPanelVisible,
    choosePanel,
    setSessionSnapshot,
    registerAppActions,
    requestAddServer: () => appActions.addServer?.(),
    requestImportOpenSsh: () => appActions.importOpenSsh?.(),
    requestFocusServerSearch: () => appActions.focusServerSearch?.(),
    requestSelectSession: (index) => appActions.selectSession?.(index),
  }), [appActions, choosePanel, panelTab, panelVisible, primaryVisible, registerAppActions, secondaryVisible, session]);

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return value;
}
