import { listen } from "@tauri-apps/api/event";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const LOG_EVENT_LIMIT = 500;

export type LogSeverity = "debug" | "info" | "warn" | "error";
export type LogSubsystem = "session" | "ssh" | "tunnel" | "sftp" | "transfer" | "diagnostics" | "workbench";

export type StructuredLogEvent = {
  id: string;
  atMs: number;
  severity: LogSeverity;
  subsystem: LogSubsystem;
  message: string;
  detail: string | null;
  serverId: string | null;
  sessionId: string | null;
  resourceId: string | null;
};

export type LogEventInput = {
  severity?: LogSeverity;
  subsystem: LogSubsystem;
  message: string;
  detail?: string | null;
  serverId?: string | null;
  sessionId?: string | null;
  resourceId?: string | null;
};

type DiagnosticStep = {
  id: string;
  label: string;
  state: "passed" | "failed" | "skipped";
  durationMs: number;
  detail: string;
};

type SftpDiagnosticEvent = {
  serverId: string;
  state: "healthy" | "failed";
  category: string;
  summary: string;
  recommendation: string | null;
  checkedAt: number;
  durationMs: number;
  steps: DiagnosticStep[];
};

type LogContextValue = {
  events: StructuredLogEvent[];
  addLog: (event: LogEventInput) => void;
  clearLogs: () => void;
};

const LogContext = createContext<LogContextValue | null>(null);

function eventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function redactLogText(value: string) {
  return value
    .replace(/-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/((?:password|passphrase|token|secret|api[_-]?key|authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1[REDACTED]@");
}

function sanitize(event: LogEventInput): StructuredLogEvent {
  return {
    id: eventId(),
    atMs: Date.now(),
    severity: event.severity ?? "info",
    subsystem: event.subsystem,
    message: redactLogText(event.message),
    detail: event.detail ? redactLogText(event.detail) : null,
    serverId: event.serverId ?? null,
    sessionId: event.sessionId ?? null,
    resourceId: event.resourceId ?? null,
  };
}

export function LogProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<StructuredLogEvent[]>([]);

  const addLog = useCallback((event: LogEventInput) => {
    const next = sanitize(event);
    setEvents((current) => [next, ...current].slice(0, LOG_EVENT_LIMIT));
  }, []);

  const clearLogs = useCallback(() => setEvents([]), []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<SftpDiagnosticEvent>("sshdeck://sftp-diagnostic", ({ payload }) => {
      if (disposed) return;
      const failed = payload.state === "failed";
      const failedSteps = payload.steps.filter((step) => step.state === "failed");
      const detail = [
        `category=${payload.category}`,
        `duration=${payload.durationMs}ms`,
        ...failedSteps.map((step) => `${step.label}: ${step.detail}`),
        payload.recommendation ? `recommendation=${payload.recommendation}` : null,
      ].filter(Boolean).join(" · ");
      addLog({
        subsystem: "diagnostics",
        severity: failed ? "error" : "info",
        message: payload.summary,
        detail,
        serverId: payload.serverId,
        resourceId: "sftp-diagnostic",
      });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addLog]);

  const value = useMemo<LogContextValue>(() => ({ events, addLog, clearLogs }), [addLog, clearLogs, events]);
  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLogs() {
  const value = useContext(LogContext);
  if (!value) throw new Error("useLogs must be used inside LogProvider");
  return value;
}
