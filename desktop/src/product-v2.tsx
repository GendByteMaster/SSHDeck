import { ReactNode } from "react";
import { Command, Keyboard, Server, ShieldCheck, Zap } from "lucide-react";
import { Button, StatusBadge } from "./ui";

export function ProductSection({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return <section className="v2-product-section">
    {eyebrow && <span className="v2-eyebrow">{eyebrow}</span>}
    <h2>{title}</h2>
    {description && <p>{description}</p>}
    {children}
  </section>;
}

export function EmptyWorkspaceV2({ onAddServer, onImport }: { onAddServer: () => void; onImport: () => void }) {
  return <div className="v2-empty-workspace">
    <div className="v2-empty-hero">
      <div className="v2-hero-icon"><Server size={28} /></div>
      <StatusBadge tone="success">OpenSSH native</StatusBadge>
      <h1>Connect without the friction.</h1>
      <p>Keep servers organized, open real PTY sessions, and move between environments without rebuilding SSH commands every time.</p>
      <div className="v2-empty-actions"><Button variant="primary" onClick={onAddServer}>Add server</Button><Button onClick={onImport}>Import OpenSSH</Button></div>
    </div>
    <div className="v2-feature-grid">
      <article><Zap size={17} /><strong>One-click sessions</strong><span>Connect from a saved server profile.</span></article>
      <article><Keyboard size={17} /><strong>Keyboard first</strong><span>Press F1 to view workspace shortcuts.</span></article>
      <article><Command size={17} /><strong>Real terminal</strong><span>PTY-backed OpenSSH, not a simulated console.</span></article>
      <article><ShieldCheck size={17} /><strong>Local by design</strong><span>Connection metadata stays on your machine.</span></article>
    </div>
  </div>;
}

export function InspectorEmptyV2() {
  return <div className="v2-inspector-empty"><div className="v2-inspector-icon"><Server size={18} /></div><strong>No active server</strong><span>Select a server to inspect connection health, session state, commands and tunnels.</span></div>;
}
