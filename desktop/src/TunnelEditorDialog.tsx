import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Tunnel, TunnelKind, useTunnels } from "./TunnelContext";

export type TunnelServer = { id: string; name: string };

type Props = {
  servers: TunnelServer[];
  activeServerId?: string | null;
  tunnel?: Tunnel | null;
  onClose: () => void;
};

export function TunnelEditorDialog({ servers, activeServerId = null, tunnel = null, onClose }: Props) {
  const { saveTunnel } = useTunnels();
  const [name, setName] = useState(tunnel?.name ?? "");
  const [serverId, setServerId] = useState(tunnel?.serverId ?? activeServerId ?? servers[0]?.id ?? "");
  const [kind, setKind] = useState<TunnelKind>(tunnel?.kind ?? "local");
  const [bindHost, setBindHost] = useState(tunnel?.bindHost ?? "127.0.0.1");
  const [localPort, setLocalPort] = useState(tunnel?.localPort ?? 5433);
  const [remoteHost, setRemoteHost] = useState(tunnel?.remoteHost ?? "127.0.0.1");
  const [remotePort, setRemotePort] = useState(tunnel?.remotePort ?? 5432);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!serverId) {
      setLocalError("Choose a server for the tunnel.");
      return;
    }
    try {
      setSubmitting(true);
      setLocalError(null);
      await saveTunnel({
        id: tunnel?.id,
        name,
        serverId,
        kind,
        bindHost: bindHost || null,
        localPort,
        remoteHost: kind === "dynamic" ? null : remoteHost || null,
        remotePort: kind === "dynamic" ? null : remotePort,
        autoRestart: tunnel?.autoRestart ?? false,
      });
      onClose();
    } catch (value) {
      setLocalError(String(value));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="modal-backdrop"><form className="modal compact-modal" onSubmit={(event) => void submit(event)}>
    <div className="modal-head">
      <div><h2>{tunnel ? "Edit SSH Tunnel" : "Add SSH Tunnel"}</h2><p>Runs independently through system <code>ssh -N</code>.</p></div>
      <button type="button" className="icon-button" onClick={onClose}><X size={16} /></button>
    </div>
    <label>Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Production DB" /></label>
    <div className="form-grid">
      <label>Server<select required value={serverId} onChange={(event) => setServerId(event.target.value)}><option value="" disabled>Select server</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>
      <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as TunnelKind)}><option value="local">Local (-L)</option><option value="remote">Remote (-R)</option><option value="dynamic">SOCKS (-D)</option></select></label>
    </div>
    <div className="form-grid">
      <label>Bind host<input value={bindHost} onChange={(event) => setBindHost(event.target.value)} /></label>
      <label>Listen port<input required type="number" min="1" max="65535" value={localPort} onChange={(event) => setLocalPort(Number(event.target.value))} /></label>
    </div>
    {kind !== "dynamic" && <div className="form-grid">
      <label>Target host<input required value={remoteHost} onChange={(event) => setRemoteHost(event.target.value)} /></label>
      <label>Target port<input required type="number" min="1" max="65535" value={remotePort} onChange={(event) => setRemotePort(Number(event.target.value))} /></label>
    </div>}
    {localError && <p className="status-error">{localError}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={submitting}>{submitting ? "Saving…" : tunnel ? "Save changes" : "Save tunnel"}</button></div>
  </form></div>;
}
