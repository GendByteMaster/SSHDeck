import { RotateCcw, Save, Settings2, ShieldCheck, TimerReset, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type WorkspaceSettings, useSettings } from "./SettingsContext";

function sameSettings(left: WorkspaceSettings, right: WorkspaceSettings) {
  return left.schemaVersion === right.schemaVersion
    && left.autoReconnectDefault === right.autoReconnectDefault
    && left.diagnosticTimeoutSeconds === right.diagnosticTimeoutSeconds
    && left.transferConcurrency === right.transferConcurrency
    && left.commandSafetyPolicy === right.commandSafetyPolicy
    && left.restoreWorkspaceLayout === right.restoreWorkspaceLayout;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 py-3 text-left transition-colors hover:border-white/[0.09] hover:bg-white/[0.035]">
    <span className="min-w-0"><strong className="block text-[12px] font-medium text-zinc-300">{label}</strong><span className="mt-1 block text-[10.5px] leading-4 text-zinc-600">{description}</span></span>
    <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors ${checked ? "border-[#6f91ff]/35 bg-[#4f7cff]/30" : "border-white/[0.08] bg-black/20"}`}><span className={`size-3.5 rounded-full transition-transform ${checked ? "translate-x-3.5 bg-[#91a9ff]" : "translate-x-0 bg-zinc-600"}`} /></span>
  </button>;
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[0.055] bg-[#0a0d12]/80 p-3">
    <div className="mb-3 flex items-start gap-2.5"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-white/[0.055] bg-white/[0.025] text-zinc-500">{icon}</span><div><strong className="block text-[12px] font-semibold text-zinc-300">{title}</strong><p className="mt-0.5 text-[10.5px] leading-4 text-zinc-600">{description}</p></div></div>
    {children}
  </section>;
}

export function SettingsWorkspace() {
  const { settings, loading, saving, error, reload, saveSettings } = useSettings();
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = useMemo(() => !sameSettings(draft, settings), [draft, settings]);

  async function save() {
    await saveSettings(draft);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  }

  if (error) {
    return <div className="flex min-h-0 flex-1 flex-col bg-[#0d1015]/92 p-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Settings</span>
      <strong className="mt-1 text-[14px] text-zinc-300">Workspace settings unavailable</strong>
      <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-3 py-2.5"><p className="text-[10px] leading-4 text-rose-200/75">{error}</p><button type="button" onClick={() => void reload()} className="mt-2 rounded-lg border border-rose-300/15 px-2 py-1 text-[10px] text-rose-200">Retry load</button></div>
      <p className="mt-3 text-[10px] leading-4 text-zinc-600">SSHDeck keeps settings-dependent actions unavailable until the persisted schema loads successfully.</p>
    </div>;
  }

  if (loading) {
    return <div className="flex min-h-0 flex-1 flex-col bg-[#0d1015]/92 p-3.5"><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Settings</span><strong className="mt-1 text-[14px] text-zinc-300">Loading workspace settings…</strong></div>;
  }

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0d1015]/92">
    <header className="border-b border-white/[0.055] px-3.5 pb-3 pt-3.5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Settings</span><strong className="mt-0.5 block truncate text-[14px] font-semibold tracking-[-0.01em] text-zinc-200">Workspace behavior</strong></div><span className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[9px] font-medium text-zinc-600">schema v{settings.schemaVersion}</span></div>
      <p className="mt-2 text-[10.5px] leading-4 text-zinc-600">Persisted in SSHDeck workspace data. Runtime-backed settings take effect after Save.</p>
    </header>

    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      <Section icon={<Workflow size={14} />} title="Sessions" description="Defaults for newly opened SSH sessions.">
        <Toggle checked={draft.autoReconnectDefault} onChange={(value) => setDraft({ ...draft, autoReconnectDefault: value })} label="Auto reconnect by default" description="New sessions inherit this value. Existing session preferences remain unchanged." />
      </Section>

      <Section icon={<TimerReset size={14} />} title="Diagnostics" description="Controls staged SFTP connection diagnostics.">
        <label className="block rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 py-3"><span className="flex items-center justify-between gap-3"><span><strong className="block text-[12px] font-medium text-zinc-300">Connection timeout</strong><small className="mt-1 block text-[10.5px] leading-4 text-zinc-600">Used by TCP, SSH and SFTP diagnostic stages.</small></span><span className="flex items-center gap-1.5"><input type="number" min={2} max={30} value={draft.diagnosticTimeoutSeconds} onChange={(event) => setDraft({ ...draft, diagnosticTimeoutSeconds: Number(event.target.value) })} className="h-8 w-16 rounded-lg border border-white/[0.075] bg-[#080a0e] px-2 text-right text-[11px] text-zinc-300 outline-none focus:border-[#5f86ff]/50" /><span className="text-[10px] text-zinc-600">sec</span></span></span></label>
      </Section>

      <Section icon={<Settings2 size={14} />} title="Transfers" description="Controls how many queued SFTP file transfers may run at once.">
        <label className="block rounded-xl border border-white/[0.055] bg-white/[0.02] px-3 py-3"><span className="flex items-center justify-between gap-3"><span><strong className="block text-[12px] font-medium text-zinc-300">Concurrent transfers</strong><small className="mt-1 block text-[10.5px] leading-4 text-zinc-600">Applies immediately to the live transfer manager after Save.</small></span><input type="number" min={1} max={6} value={draft.transferConcurrency} onChange={(event) => setDraft({ ...draft, transferConcurrency: Number(event.target.value) })} className="h-8 w-14 rounded-lg border border-white/[0.075] bg-[#080a0e] px-2 text-right text-[11px] text-zinc-300 outline-none focus:border-[#5f86ff]/50" /></span></label>
      </Section>

      <Section icon={<ShieldCheck size={14} />} title="Quick Command safety" description="SSHDeck never provides a mode that disables destructive-command protection.">
        <div className="grid gap-1.5">
          {(["standard", "strict"] as const).map((policy) => <button type="button" key={policy} onClick={() => setDraft({ ...draft, commandSafetyPolicy: policy })} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${draft.commandSafetyPolicy === policy ? "border-[#6f91ff]/25 bg-[#4f7cff]/10" : "border-white/[0.055] bg-white/[0.02] hover:bg-white/[0.035]"}`}><strong className={`block text-[11px] font-medium ${draft.commandSafetyPolicy === policy ? "text-[#9fb2ff]" : "text-zinc-400"}`}>{policy === "standard" ? "Standard" : "Strict"}</strong><span className="mt-1 block text-[10px] leading-4 text-zinc-600">{policy === "standard" ? "Low-risk commands run directly; medium, high and critical commands require confirmation." : "Every Quick Command requires confirmation; critical commands still require typing RUN."}</span></button>)}
        </div>
      </Section>

      <Section icon={<RotateCcw size={14} />} title="Workspace restore" description="Controls startup layout restoration only; saved server/session data is unaffected.">
        <Toggle checked={draft.restoreWorkspaceLayout} onChange={(value) => setDraft({ ...draft, restoreWorkspaceLayout: value })} label="Restore saved layout on launch" description="When disabled, SSHDeck starts with the default sidebar/panel layout while keeping the saved layout available." />
      </Section>

      <div className="rounded-xl border border-dashed border-white/[0.055] px-3 py-2.5 text-[10px] leading-4 text-zinc-600">OpenSSH binary override is intentionally not exposed yet. SSHDeck currently invokes <code className="text-zinc-500">ssh</code>/<code className="text-zinc-500">sftp</code> from several backend modules, so a partial override would be misleading.</div>
    </div>

    <footer className="border-t border-white/[0.055] bg-[#0a0d12]/95 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2"><button type="button" disabled={!dirty || saving} onClick={() => setDraft(settings)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.065] px-2.5 text-[10px] font-medium text-zinc-500 disabled:opacity-35"><RotateCcw size={12} /> Reset</button><div className="flex items-center gap-2">{savedNotice && <span className="text-[9.5px] text-emerald-400">Saved</span>}<button type="button" disabled={!dirty || saving || draft.diagnosticTimeoutSeconds < 2 || draft.diagnosticTimeoutSeconds > 30 || draft.transferConcurrency < 1 || draft.transferConcurrency > 6} onClick={() => void save()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#4f7cff] px-3 text-[10px] font-medium text-white shadow-[0_6px_18px_rgba(79,124,255,0.18)] disabled:cursor-not-allowed disabled:opacity-35"><Save size={12} /> {saving ? "Saving…" : "Save"}</button></div></div>
    </footer>
  </div>;
}
