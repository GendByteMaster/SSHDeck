import { Braces, Cable, ChevronDown, ChevronUp, PanelBottom, PanelLeftClose, PanelRightClose, TerminalSquare, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

type PanelTab = "terminal" | "ports" | "logs" | "transfers";

type LayoutState = {
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  panelTab: PanelTab;
};

const STORAGE_KEY = "sshdeck.workbench.layout.v4";

const defaults: LayoutState = {
  primaryVisible: true,
  secondaryVisible: true,
  panelVisible: false,
  panelTab: "terminal",
};

function loadLayout(): LayoutState {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

function activeSessionSnapshot() {
  const tab = document.querySelector<HTMLElement>(".tab.active");
  const name = tab?.querySelector<HTMLElement>("span:not(.session-dot)")?.textContent?.trim() || "No active session";
  const dot = tab?.querySelector<HTMLElement>(".session-dot");
  const state = dot ? [...dot.classList].find((item) => ["active", "reconnecting", "disconnected", "failed"].includes(item)) ?? "unknown" : "idle";
  const probeText = document.querySelector<HTMLElement>(".status-grid")?.textContent ?? "";
  const latency = probeText.match(/SSH probe\s*(\d+\s*ms)/i)?.[1] ?? null;
  return { name, state, latency };
}

export function WorkbenchChrome() {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [snapshot, setSnapshot] = useState(activeSessionSnapshot);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    document.documentElement.classList.toggle("wb-primary-hidden", !layout.primaryVisible);
    document.documentElement.classList.toggle("wb-secondary-hidden", !layout.secondaryVisible);
    document.documentElement.classList.toggle("wb-panel-open", layout.panelVisible);
  }, [layout]);

  useEffect(() => {
    const refresh = () => setSnapshot(activeSessionSnapshot());
    const observer = new MutationObserver(refresh);
    observer.observe(document.getElementById("root")!, { subtree: true, childList: true, attributes: true, characterData: true });
    const timer = window.setInterval(refresh, 1000);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "b" && event.altKey) {
        event.preventDefault();
        setLayout((value) => ({ ...value, secondaryVisible: !value.secondaryVisible }));
        return;
      }
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setLayout((value) => ({ ...value, primaryVisible: !value.primaryVisible }));
        return;
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setLayout((value) => ({ ...value, panelVisible: !value.panelVisible }));
        return;
      }
      const index = Number(event.key);
      if (!event.altKey && index >= 1 && index <= 9) {
        const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
        if (tabs[index - 1]) {
          event.preventDefault();
          tabs[index - 1].click();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function choosePanel(tab: PanelTab) {
    setLayout((value) => ({ ...value, panelVisible: true, panelTab: tab }));
  }

  return <>
    {layout.panelVisible && <section className="wb-bottom-panel" aria-label="Workbench panel">
      <header className="wb-panel-tabs">
        <button className={layout.panelTab === "terminal" ? "active" : ""} onClick={() => choosePanel("terminal")}><TerminalSquare size={13} /> Terminal</button>
        <button className={layout.panelTab === "ports" ? "active" : ""} onClick={() => choosePanel("ports")}><Cable size={13} /> Ports</button>
        <button className={layout.panelTab === "logs" ? "active" : ""} onClick={() => choosePanel("logs")}><Braces size={13} /> Logs</button>
        <button className={layout.panelTab === "transfers" ? "active" : ""} onClick={() => choosePanel("transfers")}><UploadCloud size={13} /> Transfers</button>
        <span />
        <button className="wb-panel-close" title="Hide panel (Ctrl+J)" onClick={() => setLayout((value) => ({ ...value, panelVisible: false }))}><ChevronDown size={15} /></button>
      </header>
      <div className="wb-panel-content">
        {layout.panelTab === "terminal" && <><strong>{snapshot.name}</strong><span>The interactive PTY terminal remains in the session editor above. This panel is reserved for auxiliary terminal/output views.</span></>}
        {layout.panelTab === "ports" && <><strong>Port forwarding</strong><span>Managed SSH tunnels remain available in Inspector while the Ports view is migrated into this panel.</span></>}
        {layout.panelTab === "logs" && <><strong>Session output</strong><span>Structured logs and diagnostics will live here without replacing the interactive terminal stream.</span></>}
        {layout.panelTab === "transfers" && <><strong>Transfers</strong><span>SFTP transfer queue foundation. No transfer is active.</span></>}
      </div>
    </section>}

    <footer className="wb-statusbar">
      <div className={`wb-connection-state state-${snapshot.state}`}><span className="wb-status-dot" />{snapshot.state === "idle" ? "No session" : snapshot.state}</div>
      <span className="wb-status-session">{snapshot.name}</span>
      <span>OpenSSH</span>
      {snapshot.latency && <span>{snapshot.latency}</span>}
      <span className="wb-status-spacer" />
      <button title="Toggle Servers (Ctrl+B)" onClick={() => setLayout((value) => ({ ...value, primaryVisible: !value.primaryVisible }))}><PanelLeftClose size={13} /> Servers</button>
      <button title="Toggle Inspector (Ctrl+Alt+B)" onClick={() => setLayout((value) => ({ ...value, secondaryVisible: !value.secondaryVisible }))}><PanelRightClose size={13} /> Inspector</button>
      <button title="Toggle Panel (Ctrl+J)" onClick={() => setLayout((value) => ({ ...value, panelVisible: !value.panelVisible }))}><PanelBottom size={13} />{layout.panelVisible ? <ChevronDown size={11} /> : <ChevronUp size={11} />}</button>
    </footer>
  </>;
}
