import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plus, Search, Server, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type TerminalOutput = { sessionId: string; data: number[] };
type SessionTab = { id: string; host: string };

export function App() {
  const [hosts, setHosts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const terminals = useRef(new Map<string, { terminal: Terminal; fit: FitAddon }>());
  const terminalHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void invoke<string[]>("list_hosts").then(setHosts);
  }, []);

  useEffect(() => {
    const unlisten = listen<TerminalOutput>("terminal-output", ({ payload }) => {
      terminals.current.get(payload.sessionId)?.terminal.write(new Uint8Array(payload.data));
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  useEffect(() => {
    if (!activeId || !terminalHost.current) return;
    terminalHost.current.replaceChildren();

    let entry = terminals.current.get(activeId);
    if (!entry) {
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, Cascadia Code, ui-monospace, monospace",
        fontSize: 14,
        theme: { background: "#0b0d10", foreground: "#e8ebf0", cursor: "#e8ebf0" },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      entry = { terminal, fit };
      terminals.current.set(activeId, entry);
      terminal.onData((data) => void invoke("terminal_write", { sessionId: activeId, data }));
    }

    entry.terminal.open(terminalHost.current);
    entry.fit.fit();
    void invoke("terminal_resize", { sessionId: activeId, rows: entry.terminal.rows, cols: entry.terminal.cols });

    const resize = () => {
      entry?.fit.fit();
      if (entry) void invoke("terminal_resize", { sessionId: activeId, rows: entry.terminal.rows, cols: entry.terminal.cols });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [activeId]);

  const filtered = useMemo(
    () => hosts.filter((host) => host.toLowerCase().includes(query.toLowerCase())),
    [hosts, query],
  );

  async function connect(host: string) {
    const existing = tabs.find((tab) => tab.host === host);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const id = await invoke<string>("terminal_start", { host });
    setTabs((value) => [...value, { id, host }]);
    setActiveId(id);
  }

  async function closeTab(id: string) {
    await invoke("terminal_close", { sessionId: id });
    terminals.current.get(id)?.terminal.dispose();
    terminals.current.delete(id);
    setTabs((value) => {
      const next = value.filter((tab) => tab.id !== id);
      if (activeId === id) setActiveId(next.at(-1)?.id ?? null);
      return next;
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>SSHDeck</strong><span>Remote workspace</span></div></div>
        <button className="primary"><Plus size={16} /> Add server</button>
        <div className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers" /></div>
        <div className="section-label">SSH CONFIG</div>
        <div className="server-list">
          {filtered.map((host) => (
            <button key={host} className="server-row" onClick={() => void connect(host)}>
              <span className="status-dot" /><Server size={16} /><span>{host}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty">No hosts found in ~/.ssh/config</div>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="tabs">
            {tabs.map((tab) => (
              <button key={tab.id} className={`tab ${activeId === tab.id ? "active" : ""}`} onClick={() => setActiveId(tab.id)}>
                <TerminalSquare size={14} /><span>{tab.host}</span>
                <X size={13} onClick={(event) => { event.stopPropagation(); void closeTab(tab.id); }} />
              </button>
            ))}
          </div>
        </header>
        {activeId ? <div ref={terminalHost} className="terminal-host" /> : (
          <div className="welcome">
            <div className="welcome-icon"><TerminalSquare size={30} /></div>
            <h1>Connect to a server</h1>
            <p>Select a host from your OpenSSH config. SSHDeck keeps authentication and host verification in system OpenSSH.</p>
          </div>
        )}
      </section>
    </main>
  );
}
