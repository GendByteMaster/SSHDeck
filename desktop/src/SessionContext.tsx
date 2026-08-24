import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "./LogContext";
import { hydrateSessionHistory, saveSessionHistory, SESSION_HISTORY_LIMIT, SessionHistoryItem, SessionView } from "./sessionLifecycle";
import { useWorkbench } from "./WorkbenchContext";

// Owns logical session state and command navigation. Native PTY/xterm resources stay in App as a runtime adapter.
type SessionRuntimeActions = {
  reconnect?: (session: SessionView) => void | Promise<void>;
  close?: (session: SessionView) => void | Promise<void>;
};

type SessionContextValue = {
  sessions: SessionView[];
  activeId: string | null;
  activeSession: SessionView | null;
  history: SessionHistoryItem[];
  historyLoading: boolean;
  historyError: string | null;
  setSessions: React.Dispatch<React.SetStateAction<SessionView[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  selectSession: (id: string) => void;
  selectSessionByIndex: (index: number) => void;
  selectNextSession: () => void;
  selectPreviousSession: () => void;
  appendHistory: (item: Omit<SessionHistoryItem, "id">) => void;
  updateHistory: (updater: (current: SessionHistoryItem[]) => SessionHistoryItem[]) => void;
  clearHistory: () => void;
  toggleAutoReconnect: (id: string) => void;
  requestReconnect: (session: SessionView) => void;
  requestClose: (session: SessionView) => void;
  registerRuntimeActions: (actions: SessionRuntimeActions) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const sessionsRef = useRef<SessionView[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const runtimeActions = useRef<SessionRuntimeActions>({});
  const previousSessionStates = useRef(new Map<string, SessionView["state"]>());
  const { registerAppActions } = useWorkbench();
  const { addLog } = useLogs();

  useEffect(() => {
    const previous = previousSessionStates.current;
    const next = new Map<string, SessionView["state"]>();
    for (const session of sessions) {
      next.set(session.id, session.state);
      const before = previous.get(session.id);
      if (!before) {
        addLog({
          subsystem: "session",
          severity: "info",
          message: `SSH session opened: ${session.name}`,
          detail: `state=${session.state}`,
          serverId: session.serverId,
          sessionId: session.id,
        });
      } else if (before !== session.state) {
        const severity = session.state === "failed"
          ? "error"
          : session.state === "reconnecting" || session.state === "disconnected"
            ? "warn"
            : "info";
        const diagnostics = [
          session.exitCode != null ? `exit=${session.exitCode}` : null,
          session.signal ? `signal=${session.signal}` : null,
          session.reconnectAttempts > 0 ? `attempt=${session.reconnectAttempts}` : null,
        ].filter(Boolean).join(" · ");
        addLog({
          subsystem: "session",
          severity,
          message: `${session.name}: ${before} → ${session.state}`,
          detail: diagnostics || null,
          serverId: session.serverId,
          sessionId: session.id,
        });
      }
    }
    previousSessionStates.current = next;
    sessionsRef.current = sessions;
  }, [addLog, sessions]);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    let cancelled = false;
    void hydrateSessionHistory()
      .then((items) => { if (!cancelled) setHistory(items); })
      .catch((value) => {
        if (cancelled) return;
        const text = `Could not load session history: ${String(value)}`;
        setHistoryError(text);
        addLog({ subsystem: "session", severity: "error", message: "Session history load failed", detail: text });
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [addLog]);

  const selectSession = useCallback((id: string) => {
    if (!sessionsRef.current.some((session) => session.id === id)) return;
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const selectSessionByIndex = useCallback((index: number) => {
    const session = sessionsRef.current[index];
    if (session) selectSession(session.id);
  }, [selectSession]);

  const selectNextSession = useCallback(() => {
    const current = sessionsRef.current;
    if (current.length === 0) return;
    const index = current.findIndex((session) => session.id === activeIdRef.current);
    selectSession(current[index < 0 ? 0 : (index + 1) % current.length].id);
  }, [selectSession]);

  const selectPreviousSession = useCallback(() => {
    const current = sessionsRef.current;
    if (current.length === 0) return;
    const index = current.findIndex((session) => session.id === activeIdRef.current);
    selectSession(current[index < 0 ? 0 : (index - 1 + current.length) % current.length].id);
  }, [selectSession]);

  const updateHistory = useCallback((updater: (current: SessionHistoryItem[]) => SessionHistoryItem[]) => {
    setHistory((current) => {
      const next = updater(current).slice(0, SESSION_HISTORY_LIMIT);
      saveSessionHistory(next);
      return next;
    });
  }, []);

  const appendHistory = useCallback((item: Omit<SessionHistoryItem, "id">) => {
    const session = sessionsRef.current.find((value) => value.serverId === item.serverId);
    const enriched: Omit<SessionHistoryItem, "id"> = {
      ...item,
      startedAtMs: item.startedAtMs ?? session?.startedAtMs ?? (item.durationMs > 0 ? Math.max(0, item.atMs - item.durationMs) : null),
      signal: item.signal ?? session?.signal ?? null,
    };
    updateHistory((current) => [{ ...enriched, id: `${item.atMs}-${Math.random().toString(36).slice(2, 8)}` }, ...current]);
  }, [updateHistory]);

  const clearHistory = useCallback(() => updateHistory(() => []), [updateHistory]);

  const toggleAutoReconnect = useCallback((id: string) => {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, autoReconnect: !session.autoReconnect } : session));
  }, []);

  const requestReconnect = useCallback((session: SessionView) => {
    addLog({
      subsystem: "ssh",
      severity: "info",
      message: `Reconnect requested: ${session.name}`,
      serverId: session.serverId,
      sessionId: session.id,
    });
    void runtimeActions.current.reconnect?.(session);
  }, [addLog]);

  const requestClose = useCallback((session: SessionView) => {
    addLog({
      subsystem: "session",
      severity: "info",
      message: `Close requested: ${session.name}`,
      serverId: session.serverId,
      sessionId: session.id,
    });
    void runtimeActions.current.close?.(session);
  }, [addLog]);

  const registerRuntimeActions = useCallback((actions: SessionRuntimeActions) => {
    runtimeActions.current = { ...runtimeActions.current, ...actions };
  }, []);

  useEffect(() => {
    registerAppActions({
      selectSession: selectSessionByIndex,
      nextSession: selectNextSession,
      previousSession: selectPreviousSession,
      closeSession: () => {
        const session = sessionsRef.current.find((item) => item.id === activeIdRef.current);
        if (session) requestClose(session);
      },
      reconnectSession: () => {
        const session = sessionsRef.current.find((item) => item.id === activeIdRef.current);
        if (session) requestReconnect(session);
      },
    });
  }, [registerAppActions, requestClose, requestReconnect, selectNextSession, selectPreviousSession, selectSessionByIndex]);

  const activeSession = useMemo(() => sessions.find((session) => session.id === activeId) ?? null, [activeId, sessions]);

  const value = useMemo<SessionContextValue>(() => ({
    sessions,
    activeId,
    activeSession,
    history,
    historyLoading,
    historyError,
    setSessions,
    setActiveId,
    selectSession,
    selectSessionByIndex,
    selectNextSession,
    selectPreviousSession,
    appendHistory,
    updateHistory,
    clearHistory,
    toggleAutoReconnect,
    requestReconnect,
    requestClose,
    registerRuntimeActions,
  }), [
    activeId,
    activeSession,
    appendHistory,
    clearHistory,
    history,
    historyError,
    historyLoading,
    registerRuntimeActions,
    requestClose,
    requestReconnect,
    selectNextSession,
    selectPreviousSession,
    selectSession,
    selectSessionByIndex,
    sessions,
    toggleAutoReconnect,
    updateHistory,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessions must be used inside SessionProvider");
  return value;
}
