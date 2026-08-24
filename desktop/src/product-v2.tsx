import { ReactNode } from "react";
import { Keyboard, Plus, Server } from "lucide-react";
import { Button } from "./ui";

export function ProductSection({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return <section className="v2-product-section">
    {eyebrow && <span className="v2-eyebrow">{eyebrow}</span>}
    <h2>{title}</h2>
    {description && <p>{description}</p>}
    {children}
  </section>;
}

export function EmptyWorkspaceV2({ onAddServer, onImport }: { onAddServer: () => void; onImport: () => void }) {
  return <div className="v3-empty-workspace">
    <div className="v3-empty-icon"><Server size={22} /></div>
    <h1>No active session</h1>
    <p>Select a server from the sidebar to connect, or create a new connection.</p>
    <div className="v3-empty-actions">
      <Button variant="primary" onClick={onAddServer}><Plus size={14} /> Add server</Button>
      <Button variant="ghost" onClick={onImport}>Import OpenSSH</Button>
    </div>
    <div className="v3-empty-hint"><Keyboard size={13} /><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>K</kbd> Search servers</span><span>·</span><span><kbd>F1</kbd> Shortcuts</span></div>
  </div>;
}

export function InspectorEmptyV2() {
  return <div className="v2-inspector-empty"><div className="v2-inspector-icon"><Server size={18} /></div><strong>No active server</strong><span>Select a server to inspect connection health, session state, commands and tunnels.</span></div>;
}
