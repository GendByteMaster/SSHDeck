import { Button as HeroButton } from "@heroui/react";
import {
  Copy,
  Download,
  FolderClock,
  FolderTree,
  History,
  Pencil,
  Plus,
  Search,
  Server,
  Settings,
  Star,
  TerminalSquare,
  Trash2,
  Waypoints,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useCommandContextMenu } from "./commands/ContextMenuService";
import { ServerStatus } from "./serverStatus";
import { SftpBrowser } from "./SftpBrowser";
import { useWorkbench } from "./WorkbenchContext";

export type SidebarServer = {
  id: string;
  name: string;
  host: string;
  user: string | null;
  port: number;
  identityFile: string | null;
  group: string | null;
  favorite: boolean;
  sourceAlias: string | null;
  lastConnectedAt: number | null;
};

type Props = {
  servers: SidebarServer[];
  favorites: SidebarServer[];
  groups: [string, SidebarServer[]][];
  query: string;
  statuses: Record<string, ServerStatus>;
  checking: Set<string>;
  onQueryChange: (value: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onConnect: (server: SidebarServer) => void;
  onFavorite: (server: SidebarServer) => void;
  onExport: (server: SidebarServer) => void;
  onEdit: (server: SidebarServer) => void;
  onDelete: (server: SidebarServer) => void;
};

type SidebarView = "servers" | "sftp";

const clamp = (value: number) => Math.min(520, Math.max(280, value));

const activityItems = [
  { id: "servers" as const, label: "Servers", icon: Server, enabled: true },
  { id: "sftp" as const, label: "Remote files", icon: FolderTree, enabled: true },
  { id: null, label: "Search", icon: Search, enabled: false },
  { id: null, label: "Port forwarding", icon: Waypoints, enabled: false },
  { id: null, label: "Sessions", icon: TerminalSquare, enabled: false },
  { id: null, label: "History", icon: History, enabled: false },
  { id: null, label: "Transfers", icon: FolderClock, enabled: false },
];

function statusClass(state: string) {
  switch (state) {
    case "online": return "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.08)]";
    case "auth_required": return "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.08)]";
    case "offline":
    case "error": return "bg-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,0.08)]";
    case "checking": return "animate-pulse bg-sky-400";
    default: return "bg-zinc-600";
  }
}

function IconAction({ label, children, onClick, danger = false }: { label: string; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-7 place-items-center rounded-lg border border-transparent transition-colors ${danger ? "text-zinc-500 hover:border-rose-400/15 hover:bg-rose-400/10 hover:text-rose-300" : "text-zinc-500 hover:border-white/[0.06] hover:bg-white/[0.05] hover:text-zinc-200"}`}>{children}</button>;
}

function ServerItem({ server, status, checking, selected, onSelect, onContextMenu, onConnect, onFavorite, onExport, onEdit, onDelete }: {
  server: SidebarServer;
  status?: ServerStatus;
  checking: boolean;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onConnect: () => void;
  onFavorite: () => void;
  onExport: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const state = checking ? "checking" : status?.state ?? "unknown";
  return <motion.div
    layout="position"
    initial={{ opacity: 0, y: 3 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.16 }}
    onPointerDown={onSelect}
    onContextMenu={onContextMenu}
    className={`group relative mb-1 flex min-h-14 items-center rounded-xl border transition-colors ${selected ? "border-[#6f91ff]/20 bg-[#4f7cff]/10" : "border-transparent hover:border-white/[0.055] hover:bg-white/[0.035]"}`}
  >
    <button type="button" onClick={onConnect} className="server-connect flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#5f86ff]/60">
      <span className={`size-2 shrink-0 rounded-full ${statusClass(state)}`} />
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${selected ? "border-[#6f91ff]/15 bg-[#4f7cff]/10 text-[#8fa8ff]" : "border-white/[0.055] bg-white/[0.025] text-zinc-500"}`}><Server size={15} strokeWidth={1.8} /></span>
      <span className="min-w-0 flex-1">
        <strong className={`block truncate text-[13px] font-medium leading-5 ${selected ? "text-zinc-100" : "text-zinc-200"}`}>{server.name}</strong>
        <small className="mt-0.5 block truncate text-[11px] leading-4 text-zinc-600">{server.user ? `${server.user}@` : ""}{server.host}:{server.port}{status?.latencyMs != null ? ` · ${status.latencyMs} ms` : ""}</small>
      </span>
    </button>
    <div className="mr-1 hidden shrink-0 items-center gap-0.5 rounded-lg bg-[#0c0f14]/95 pl-1 group-hover:flex group-focus-within:flex">
      <IconAction label="Favorite" onClick={onFavorite}><Star size={13} fill={server.favorite ? "currentColor" : "none"} /></IconAction>
      <IconAction label="Export OpenSSH snippet" onClick={onExport}><Copy size={13} /></IconAction>
      <IconAction label="Edit server" onClick={onEdit}><Pencil size={13} /></IconAction>
      <IconAction label="Delete server" onClick={onDelete} danger><Trash2 size={13} /></IconAction>
    </div>
  </motion.div>;
}

export function SidebarV2({ servers, favorites, groups, query, statuses, checking, onQueryChange, onAdd, onImport, onConnect, onFavorite, onExport, onEdit, onDelete }: Props) {
  const count = favorites.length + groups.reduce((sum, [, items]) => sum + items.length, 0);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<SidebarView>("servers");
  const { registerAppActions, primaryWidth, setPrimaryWidth, selectedServer, setSelectedServer } = useWorkbench();
  const popupCommands = useCommandContextMenu();
  const allServers = servers;

  useEffect(() => {
    registerAppActions({ addServer: onAdd, importOpenSsh: onImport, focusServerSearch: () => { setView("servers"); searchRef.current?.focus(); searchRef.current?.select(); } });
  }, [onAdd, onImport, registerAppActions]);

  useEffect(() => {
    if (selectedServer.id && !allServers.some((server) => server.id === selectedServer.id)) {
      setSelectedServer({ id: null, name: "No server selected" });
    }
  }, [allServers, selectedServer.id, setSelectedServer]);

  function selectServer(server: SidebarServer) {
    setSelectedServer({ id: server.id, name: server.name });
  }

  function selectSftpServer(serverId: string) {
    const server = allServers.find((value) => value.id === serverId);
    if (server) selectServer(server);
  }

  function showServerContextMenu(server: SidebarServer, event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    selectServer(server);
    void popupCommands(["server.connect", "server.edit", "server.exportOpenSsh", "server.delete"]);
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = { x: event.clientX, width: primaryWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    setPrimaryWidth(clamp(dragStart.current.width + event.clientX - dragStart.current.x));
  }

  function endResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function renderServer(server: SidebarServer) {
    return <ServerItem
      key={server.id}
      server={server}
      status={statuses[server.id]}
      checking={checking.has(server.id)}
      selected={selectedServer.id === server.id}
      onSelect={() => selectServer(server)}
      onContextMenu={(event) => showServerContextMenu(server, event)}
      onConnect={() => onConnect(server)}
      onFavorite={() => onFavorite(server)}
      onExport={() => onExport(server)}
      onEdit={() => onEdit(server)}
      onDelete={() => onDelete(server)}
    />;
  }

  return <aside className="workbench-primary relative grid h-full shrink-0 grid-cols-[52px_minmax(0,1fr)] overflow-visible border-r border-white/[0.055] bg-[#0a0c10]/95 text-zinc-200" style={{ width: primaryWidth }}>
    <nav className="flex min-h-0 flex-col items-center border-r border-white/[0.055] bg-[#080a0e] px-1.5 py-2" aria-label="Workbench navigation">
      <div className="mb-2 grid size-9 place-items-center rounded-xl bg-zinc-100 text-[13px] font-bold text-zinc-900 shadow-sm">S</div>
      <div className="flex w-full flex-col items-center gap-1">
        {activityItems.map(({ id, label, icon: Icon, enabled }, index) => {
          const active = id !== null && view === id;
          return <button
            key={`${label}-${index}`}
            type="button"
            title={enabled ? label : `${label} · coming soon`}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            disabled={!enabled}
            onClick={() => { if (id) setView(id); }}
            className={`relative grid size-10 place-items-center rounded-xl transition-colors ${active ? "bg-[#4f7cff]/12 text-[#89a5ff]" : "text-zinc-600 hover:bg-white/[0.035] hover:text-zinc-400 disabled:cursor-default disabled:opacity-65"}`}
          >
            {active && <span className="absolute -left-1.5 h-5 w-0.5 rounded-r-full bg-[#6f91ff]" />}
            <Icon size={18} strokeWidth={1.8} />
          </button>;
        })}
      </div>
      <div className="mt-auto"><button type="button" title="Settings · coming soon" aria-label="Settings" disabled className="grid size-10 place-items-center rounded-xl text-zinc-600 opacity-65"><Settings size={18} strokeWidth={1.8} /></button></div>
    </nav>

    {view === "servers" ? <div className="flex min-h-0 min-w-0 flex-col bg-[#0d1015]/92">
      <header className="px-3.5 pb-3 pt-3.5">
        <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Servers</span><strong className="mt-0.5 block truncate text-[14px] font-semibold tracking-[-0.01em] text-zinc-200">Connections</strong></div><span className="grid min-w-6 place-items-center rounded-full border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{count}</span></div>
        <div className="grid grid-cols-[1fr_auto] gap-2"><HeroButton onPress={onAdd} className="h-9 rounded-xl bg-[#4f7cff] px-3 text-[12px] font-medium text-white shadow-[0_8px_22px_rgba(79,124,255,0.2)]"><Plus size={14} /> Add server</HeroButton><HeroButton onPress={onImport} className="h-9 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-[12px] font-medium text-zinc-400"><Download size={14} /> Import</HeroButton></div>
        <label className="mt-2.5 flex h-9 items-center gap-2 rounded-xl border border-white/[0.065] bg-[#090b0f] px-3 text-zinc-600 transition-colors focus-within:border-[#5f86ff]/45 focus-within:text-zinc-400"><Search size={14} strokeWidth={1.8} /><input ref={searchRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search servers" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] text-zinc-300 outline-none placeholder:text-zinc-700" /></label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
        {favorites.length > 0 && <section className="mb-4"><div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700">Favorites</div>{favorites.map(renderServer)}</section>}
        {groups.map(([group, items]) => <section key={group} className="mb-4"><div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700">{group}</div>{items.map(renderServer)}</section>)}
        {count === 0 && <div className="mx-2 mt-6 flex flex-col items-center rounded-2xl border border-dashed border-white/[0.07] px-4 py-7 text-center"><div className="grid size-9 place-items-center rounded-xl bg-white/[0.035] text-zinc-600"><Server size={16} /></div><strong className="mt-3 text-[12px] font-medium text-zinc-400">No servers</strong><span className="mt-1 max-w-44 text-[11px] leading-5 text-zinc-700">Add a server or import your OpenSSH config.</span></div>}
      </div>
    </div> : <div className="flex min-h-0 min-w-0 flex-col bg-[#0d1015]/92">
      <SftpBrowser servers={allServers} selectedServerId={selectedServer.id} onSelectServer={selectSftpServer} />
    </div>}

    <div role="separator" aria-orientation="vertical" aria-label="Resize server sidebar" className="absolute -right-1.5 top-0 z-30 h-full w-3 cursor-col-resize touch-none after:absolute after:left-[5px] after:top-0 after:h-full after:w-px after:bg-transparent hover:after:bg-[#6f91ff]/50" onPointerDown={beginResize} onPointerMove={resize} onPointerUp={endResize} />
  </aside>;
}
