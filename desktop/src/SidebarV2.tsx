import { Copy, Download, FolderClock, History, Pencil, Plus, Search, Server, Settings, Star, TerminalSquare, Trash2, Waypoints } from "lucide-react";
import { ServerStatus } from "./serverStatus";

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

function ServerItem({ server, status, checking, onConnect, onFavorite, onExport, onEdit, onDelete }: {
  server: SidebarServer;
  status?: ServerStatus;
  checking: boolean;
  onConnect: () => void;
  onFavorite: () => void;
  onExport: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const state = checking ? "checking" : status?.state ?? "unknown";
  return <div className="v2-server-item">
    <button className="v2-server-main" onClick={onConnect}>
      <span className={`status-dot ${state}`} />
      <span className="v2-server-icon"><Server size={15} /></span>
      <span className="v2-server-copy">
        <strong>{server.name}</strong>
        <small>{server.user ? `${server.user}@` : ""}{server.host}:{server.port}{status?.latencyMs != null ? ` · ${status.latencyMs} ms` : ""}</small>
      </span>
    </button>
    <div className="v2-server-actions">
      <button aria-label="Favorite" title="Favorite" onClick={onFavorite}><Star size={13} fill={server.favorite ? "currentColor" : "none"} /></button>
      <button aria-label="Export OpenSSH snippet" title="Export OpenSSH snippet" onClick={onExport}><Copy size={13} /></button>
      <button aria-label="Edit server" title="Edit" onClick={onEdit}><Pencil size={13} /></button>
      <button aria-label="Delete server" title="Delete" onClick={onDelete}><Trash2 size={13} /></button>
    </div>
  </div>;
}

export function SidebarV2({ favorites, groups, query, statuses, checking, onQueryChange, onAdd, onImport, onConnect, onFavorite, onExport, onEdit, onDelete }: Props) {
  const count = favorites.length + groups.reduce((sum, [, items]) => sum + items.length, 0);
  return <aside className="sidebar v2-sidebar workbench-primary">
    <nav className="activity-bar" aria-label="Workbench navigation">
      <div className="activity-brand">S</div>
      <button className="activity-item active" title="Servers"><Server size={19} /></button>
      <button className="activity-item" title="Search"><Search size={19} /></button>
      <button className="activity-item" title="Port forwarding"><Waypoints size={19} /></button>
      <button className="activity-item" title="Sessions"><TerminalSquare size={19} /></button>
      <button className="activity-item" title="History"><History size={19} /></button>
      <button className="activity-item" title="Transfers"><FolderClock size={19} /></button>
      <span className="activity-spacer" />
      <button className="activity-item" title="Settings"><Settings size={19} /></button>
    </nav>

    <div className="context-sidebar">
      <div className="v2-brand-row workbench-view-title">
        <div><span className="eyebrow">SERVERS</span><strong>Connections</strong></div>
        <span className="v2-server-count">{count}</span>
      </div>
      <div className="sidebar-actions">
        <button className="primary" onClick={onAdd}><Plus size={15} /> Add server</button>
        <button className="secondary" onClick={onImport}><Download size={15} /> Import</button>
      </div>
      <div className="search"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search servers" /></div>
      <div className="server-list v2-server-list">
        {favorites.length > 0 && <section><div className="section-label">Favorites</div>{favorites.map((server) => <ServerItem key={server.id} server={server} status={statuses[server.id]} checking={checking.has(server.id)} onConnect={() => onConnect(server)} onFavorite={() => onFavorite(server)} onExport={() => onExport(server)} onEdit={() => onEdit(server)} onDelete={() => onDelete(server)} />)}</section>}
        {groups.map(([group, items]) => <section key={group}><div className="section-label">{group}</div>{items.map((server) => <ServerItem key={server.id} server={server} status={statuses[server.id]} checking={checking.has(server.id)} onConnect={() => onConnect(server)} onFavorite={() => onFavorite(server)} onExport={() => onExport(server)} onEdit={() => onEdit(server)} onDelete={() => onDelete(server)} />)}</section>)}
        {count === 0 && <div className="v2-sidebar-empty"><Server size={18} /><strong>No servers</strong><span>Add a server or import your OpenSSH config.</span></div>}
      </div>
    </div>
  </aside>;
}
