import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRight,
  Clock3,
  Command as CommandIcon,
  Copy,
  FolderClock,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
  TerminalSquare,
  Waypoints,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCommands } from "./commands/CommandService";
import { formatDuration } from "./sessionLifecycle";
import { useSessions } from "./SessionContext";
import { useTunnels } from "./TunnelContext";
import { useTransfers } from "./TransferContext";
import { useWorkbench } from "./WorkbenchContext";

export type SearchServer = {
  id: string;
  name: string;
  host: string;
  user: string | null;
  port: number;
  group: string | null;
  sourceAlias: string | null;
};

type QuickCommand = {
  id: string;
  name: string;
  command: string;
  serverId: string | null;
  group: string | null;
};

type WorkspaceData = { quickCommands?: QuickCommand[] };
type SearchFilter = "all" | "servers" | "sessions" | "history" | "ports" | "transfers" | "commands";
type ResultKind = "server" | "session" | "history" | "tunnel" | "transfer" | "quick" | "command";

type SearchResult = {
  id: string;
  kind: ResultKind;
  filter: Exclude<SearchFilter, "all">;
  title: string;
  subtitle: string;
  meta: string | null;
  score: number;
  actionLabel: string | null;
  actionDisabled?: boolean;
  actionReason?: string;
  action?: () => void | Promise<void>;
};

type Props = {
  servers: SearchServer[];
  onConnectServer: (serverId: string) => void;
};

const filters: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "servers", label: "Servers" },
  { id: "sessions", label: "Sessions" },
  { id: "history", label: "History" },
  { id: "ports", label: "Ports" },
  { id: "transfers", label: "Transfers" },
  { id: "commands", label: "Commands" },
];

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function matchScore(query: string, values: Array<string | number | null | undefined>) {
  if (!query) return 0;
  let best = 0;
  for (const raw of values) {
    const value = normalized(String(raw ?? ""));
    if (!value) continue;
    if (value === query) best = Math.max(best, 120);
    else if (value.startsWith(query)) best = Math.max(best, 90);
    else if (value.split(/\s+/).some((part) => part.startsWith(query))) best = Math.max(best, 70);
    else if (value.includes(query)) best = Math.max(best, 50);
  }
  return best;
}

function kindLabel(kind: ResultKind) {
  switch (kind) {
    case "server": return "Server";
    case "session": return "Session";
    case "history": return "History";
    case "tunnel": return "Port";
    case "transfer": return "Transfer";
    case "quick": return "Quick Command";
    case "command": return "Command";
  }
}

function ResultIcon({ kind }: { kind: ResultKind }) {
  const common = { size: 14, strokeWidth: 1.8 };
  if (kind === "server") return <Server {...common} />;
  if (kind === "session") return <TerminalSquare {...common} />;
  if (kind === "history") return <History {...common} />;
  if (kind === "tunnel") return <Waypoints {...common} />;
  if (kind === "transfer") return <FolderClock {...common} />;
  return <CommandIcon {...common} />;
}

export function SearchWorkspace({ servers, onConnectServer }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [quickLoading, setQuickLoading] = useState(true);
  const [quickError, setQuickError] = useState<string | null>(null);
  const { sessions, history, selectSession } = useSessions();
  const { tunnels, statuses } = useTunnels();
  const { transfers } = useTransfers();
  const { commands, execute } = useCommands();
  const { choosePanel, setSelectedServer, setSelectedTunnel } = useWorkbench();

  const loadQuickCommands = useCallback(async () => {
    try {
      setQuickLoading(true);
      const workspace = await invoke<WorkspaceData>("workspace_load");
      setQuickCommands(Array.isArray(workspace.quickCommands) ? workspace.quickCommands : []);
      setQuickError(null);
    } catch (value) {
      setQuickError(`Quick Commands are unavailable: ${String(value)}`);
    } finally {
      setQuickLoading(false);
    }
  }, []);

  useEffect(() => { void loadQuickCommands(); }, [loadQuickCommands]);

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const needle = normalized(query);

  const results = useMemo<SearchResult[]>(() => {
    if (!needle) return [];
    const values: SearchResult[] = [];

    if (filter === "all" || filter === "servers") {
      for (const server of servers) {
        const score = matchScore(needle, [server.name, server.host, server.user, server.port, server.group, server.sourceAlias]);
        if (!score) continue;
        values.push({
          id: `server:${server.id}`,
          kind: "server",
          filter: "servers",
          title: server.name,
          subtitle: `${server.user ? `${server.user}@` : ""}${server.host}:${server.port}`,
          meta: server.group ?? server.sourceAlias ?? null,
          score: score + 8,
          actionLabel: "Connect",
          action: () => {
            setSelectedServer({ id: server.id, name: server.name });
            onConnectServer(server.id);
          },
        });
      }
    }

    if (filter === "all" || filter === "sessions") {
      for (const session of sessions) {
        const server = serverById.get(session.serverId);
        const score = matchScore(needle, [session.name, session.state, server?.host, server?.user, session.exitCode, session.signal]);
        if (!score) continue;
        values.push({
          id: `session:${session.id}`,
          kind: "session",
          filter: "sessions",
          title: session.name,
          subtitle: `${session.state} · ${formatDuration(session.durationMs)}`,
          meta: session.exitCode != null ? `exit ${session.exitCode}` : session.signal ? `signal ${session.signal}` : server?.host ?? null,
          score: score + (session.state === "active" ? 14 : 6),
          actionLabel: "Focus",
          action: () => selectSession(session.id),
        });
      }
    }

    if (filter === "all" || filter === "history") {
      for (const item of history) {
        const server = serverById.get(item.serverId);
        const score = matchScore(needle, [item.serverName, item.state, server?.host, item.exitCode, item.signal]);
        if (!score) continue;
        values.push({
          id: `history:${item.id}`,
          kind: "history",
          filter: "history",
          title: item.serverName,
          subtitle: `${item.state} · ${new Date(item.atMs).toLocaleString()}`,
          meta: `${formatDuration(item.durationMs)}${item.exitCode != null ? ` · exit ${item.exitCode}` : ""}`,
          score,
          actionLabel: server ? "Reconnect" : "Unavailable",
          actionDisabled: !server,
          actionReason: server ? undefined : "The saved server entry no longer exists",
          action: server ? () => {
            setSelectedServer({ id: server.id, name: server.name });
            onConnectServer(server.id);
          } : undefined,
        });
      }
    }

    if (filter === "all" || filter === "ports") {
      for (const tunnel of tunnels) {
        const server = serverById.get(tunnel.serverId);
        const status = statuses[tunnel.id];
        const score = matchScore(needle, [
          tunnel.name,
          tunnel.kind,
          tunnel.bindHost,
          tunnel.localPort,
          tunnel.remoteHost,
          tunnel.remotePort,
          server?.name,
          server?.host,
          status?.state,
        ]);
        if (!score) continue;
        values.push({
          id: `tunnel:${tunnel.id}`,
          kind: "tunnel",
          filter: "ports",
          title: tunnel.name,
          subtitle: `${tunnel.kind.toUpperCase()} · ${tunnel.bindHost ?? "127.0.0.1"}:${tunnel.localPort}`,
          meta: `${server?.name ?? "Unknown server"} · ${status?.state ?? "stopped"}`,
          score: score + (status?.state === "running" ? 8 : 0),
          actionLabel: "Open",
          action: () => {
            setSelectedTunnel({ id: tunnel.id, name: tunnel.name, state: status?.state ?? "stopped" });
            choosePanel("ports");
          },
        });
      }
    }

    if (filter === "all" || filter === "transfers") {
      for (const transfer of transfers) {
        const server = serverById.get(transfer.serverId);
        const score = matchScore(needle, [
          transfer.name,
          transfer.direction,
          transfer.state,
          transfer.localPath,
          transfer.remotePath,
          transfer.error,
          server?.name,
          server?.host,
        ]);
        if (!score) continue;
        values.push({
          id: `transfer:${transfer.id}`,
          kind: "transfer",
          filter: "transfers",
          title: transfer.name,
          subtitle: `${transfer.direction} · ${transfer.state}`,
          meta: server?.name ?? transfer.remotePath,
          score: score + (transfer.state === "running" ? 8 : 0),
          actionLabel: "Open",
          action: () => choosePanel("transfers"),
        });
      }
    }

    if (filter === "all" || filter === "commands") {
      for (const item of quickCommands) {
        const scopedServer = item.serverId ? serverById.get(item.serverId) : null;
        const score = matchScore(needle, [item.name, item.command, item.group, scopedServer?.name, scopedServer?.host]);
        if (!score) continue;
        values.push({
          id: `quick:${item.id}`,
          kind: "quick",
          filter: "commands",
          title: item.name,
          subtitle: item.command,
          meta: scopedServer ? `Server: ${scopedServer.name}` : item.group ? `Group: ${item.group}` : "All servers",
          score,
          actionLabel: "Copy",
          action: () => invoke("copy_text", { text: item.command }),
        });
      }

      for (const command of commands) {
        if (command.readiness === "planned" || command.id === "workbench.view.search") continue;
        const score = matchScore(needle, [command.title, command.description, command.category, command.shortcut, command.id]);
        if (!score) continue;
        values.push({
          id: `command:${command.id}`,
          kind: "command",
          filter: "commands",
          title: command.title,
          subtitle: command.description,
          meta: [command.category, command.shortcut].filter(Boolean).join(" · ") || null,
          score: score + 4,
          actionLabel: command.enabled ? "Run" : "Unavailable",
          actionDisabled: !command.enabled,
          actionReason: command.availabilityReason,
          action: command.enabled ? () => execute(command.id) : undefined,
        });
      }
    }

    return values
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, 80);
  }, [
    choosePanel,
    commands,
    execute,
    filter,
    history,
    needle,
    onConnectServer,
    quickCommands,
    selectSession,
    serverById,
    servers,
    sessions,
    setSelectedServer,
    setSelectedTunnel,
    statuses,
    transfers,
    tunnels,
  ]);

  const counts = useMemo(() => {
    const value: Record<Exclude<SearchFilter, "all">, number> = {
      servers: 0,
      sessions: 0,
      history: 0,
      ports: 0,
      transfers: 0,
      commands: 0,
    };
    for (const result of results) value[result.filter] += 1;
    return value;
  }, [results]);

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0d1015]/92">
    <header className="border-b border-white/[0.055] px-3.5 pb-3 pt-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Search</span>
          <strong className="mt-0.5 block truncate text-[14px] font-semibold tracking-[-0.01em] text-zinc-200">Workbench</strong>
        </div>
        <button type="button" onClick={() => void loadQuickCommands()} disabled={quickLoading} title="Refresh workspace search data" className="grid size-8 place-items-center rounded-lg border border-white/[0.055] bg-white/[0.025] text-zinc-600 transition-colors hover:text-zinc-300 disabled:opacity-40">
          {quickLoading ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-white/[0.075] bg-[#090b0f] px-3 text-zinc-600 transition-colors focus-within:border-[#5f86ff]/50 focus-within:text-zinc-400">
        <Search size={15} strokeWidth={1.8} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Servers, sessions, ports, transfers, commands…" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-700" />
        {query && <button type="button" onClick={() => setQuery("")} className="rounded-md px-1.5 py-0.5 text-[9px] font-medium text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300">Clear</button>}
      </label>

      <div className="mt-2.5 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {filters.map((item) => {
          const count = item.id === "all" ? results.length : counts[item.id];
          return <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`shrink-0 rounded-lg border px-2 py-1 text-[9.5px] font-medium transition-colors ${filter === item.id ? "border-[#6f91ff]/25 bg-[#4f7cff]/12 text-[#9ab0ff]" : "border-white/[0.05] bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}>
            {item.label}{needle && count > 0 ? ` ${count}` : ""}
          </button>;
        })}
      </div>

      {quickError && <p className="mt-2 text-[9px] leading-4 text-amber-300/70">{quickError} Other workspace sources are still searchable.</p>}
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      {!needle ? <div className="mx-1 mt-5 flex flex-col items-center rounded-2xl border border-dashed border-white/[0.07] px-4 py-8 text-center">
        <div className="grid size-10 place-items-center rounded-xl bg-white/[0.035] text-zinc-600"><Search size={17} /></div>
        <strong className="mt-3 text-[12px] font-medium text-zinc-400">Search the whole workspace</strong>
        <span className="mt-1 max-w-52 text-[10.5px] leading-5 text-zinc-700">Find servers, current sessions, history, tunnels, transfers, Quick Commands, and SSHDeck commands without starting another background index.</span>
      </div> : results.length === 0 ? <div className="mx-1 mt-5 rounded-2xl border border-dashed border-white/[0.07] px-4 py-7 text-center">
        <strong className="text-[12px] font-medium text-zinc-400">No matches</strong>
        <p className="mt-1 text-[10.5px] leading-5 text-zinc-700">Try another term or switch back to All.</p>
      </div> : <div className="space-y-1">
        {results.map((result) => <article key={result.id} className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 transition-colors hover:border-white/[0.055] hover:bg-white/[0.03]">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.05] bg-white/[0.025] text-zinc-500"><ResultIcon kind={result.kind} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <strong className="truncate text-[11.5px] font-medium text-zinc-300">{result.title}</strong>
              <span className="shrink-0 rounded-md border border-white/[0.045] bg-black/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.08em] text-zinc-700">{kindLabel(result.kind)}</span>
            </div>
            <p className="mt-0.5 truncate text-[9.5px] text-zinc-600" title={result.subtitle}>{result.subtitle}</p>
            {result.meta && <p className="mt-0.5 truncate text-[8.5px] text-zinc-700" title={result.meta}>{result.meta}</p>}
          </div>
          {result.actionLabel && <button type="button" disabled={result.actionDisabled || !result.action} title={result.actionReason ?? result.actionLabel} onClick={() => void result.action?.()} className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/[0.055] bg-white/[0.025] px-2 text-[9px] font-medium text-zinc-500 transition-colors hover:border-[#6f91ff]/20 hover:bg-[#4f7cff]/8 hover:text-[#9ab0ff] disabled:cursor-not-allowed disabled:opacity-35">
            {result.kind === "quick" ? <Copy size={10} /> : result.kind === "history" ? <Clock3 size={10} /> : <ArrowRight size={10} />}
            {result.actionLabel}
          </button>}
        </article>)}
      </div>}
    </div>
  </div>;
}
