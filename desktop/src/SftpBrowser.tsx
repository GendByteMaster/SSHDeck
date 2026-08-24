import { Button } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  CircleCheck,
  CircleMinus,
  CircleX,
  File,
  Folder,
  FolderPlus,
  Link,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCw,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTransfers } from "./TransferContext";

export type SftpServer = {
  id: string;
  name: string;
  host: string;
};

type SftpEntry = {
  name: string;
  path: string;
  kind: "directory" | "file" | "symlink";
  size: number;
  permissions: string;
  modified: string;
};

type DiagnosticStep = {
  id: string;
  label: string;
  state: "passed" | "failed" | "skipped";
  durationMs: number;
  detail: string;
};

type SftpDiagnostic = {
  serverId: string;
  state: "healthy" | "failed";
  category: string;
  summary: string;
  recommendation: string | null;
  checkedAt: number;
  durationMs: number;
  steps: DiagnosticStep[];
};

type EditorState =
  | { kind: "mkdir"; value: string }
  | { kind: "rename"; entry: SftpEntry; value: string }
  | null;

type Props = {
  servers: SftpServer[];
  selectedServerId: string | null;
  onSelectServer: (serverId: string) => void;
};

function parentPath(path: string) {
  const clean = path.trim();
  if (!clean || clean === "." || clean === "/") return clean === "/" ? "/" : ".";
  if (clean.startsWith("./")) {
    const rest = clean.slice(2).replace(/\/+$/, "");
    const slash = rest.lastIndexOf("/");
    return slash < 0 ? "." : `./${rest.slice(0, slash)}`;
  }
  const withoutTrailing = clean.replace(/\/+$/, "");
  const slash = withoutTrailing.lastIndexOf("/");
  return slash <= 0 ? "/" : withoutTrailing.slice(0, slash);
}

function joinRemote(parent: string, name: string) {
  if (parent === "/") return `/${name}`;
  if (parent === ".") return `./${name}`;
  return `${parent.replace(/\/+$/, "")}/${name}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function diagnosticLabel(category: string) {
  return category.replace(/_/g, " ");
}

function EntryIcon({ kind }: { kind: SftpEntry["kind"] }) {
  if (kind === "directory") return <Folder size={15} fill="currentColor" className="text-amber-300/80" />;
  if (kind === "symlink") return <Link size={14} className="text-sky-300/80" />;
  return <File size={14} className="text-zinc-500" />;
}

function DiagnosticStepIcon({ state }: { state: DiagnosticStep["state"] }) {
  if (state === "passed") return <CircleCheck size={13} className="text-emerald-400" />;
  if (state === "failed") return <CircleX size={13} className="text-rose-400" />;
  return <CircleMinus size={13} className="text-zinc-600" />;
}

function DiagnosticsCard({ diagnostic, loading, onRun }: {
  diagnostic: SftpDiagnostic | null;
  loading: boolean;
  onRun: () => void;
}) {
  if (!diagnostic && !loading) return null;

  if (!diagnostic) {
    return <section className="border-b border-sky-400/10 bg-sky-400/[0.035] px-3 py-3">
      <div className="flex items-center gap-2 text-[10.5px] font-medium text-sky-200/80">
        <LoaderCircle size={13} className="animate-spin" /> Running SFTP diagnostics…
      </div>
      <p className="mt-1.5 text-[9.5px] leading-4 text-zinc-600">Checking the connection path, SSH authentication, and the SFTP subsystem.</p>
    </section>;
  }

  const healthy = diagnostic.state === "healthy";
  return <section className={`border-b px-3 py-3 ${healthy ? "border-emerald-400/10 bg-emerald-400/[0.025]" : "border-amber-400/10 bg-amber-400/[0.025]"}`}>
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border ${healthy ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300" : "border-amber-400/15 bg-amber-400/[0.06] text-amber-300"}`}>
        {healthy ? <CircleCheck size={14} /> : <Wrench size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <strong className="truncate text-[10.5px] font-semibold text-zinc-300">{diagnostic.summary}</strong>
          <span className="shrink-0 rounded-md border border-white/[0.055] bg-black/10 px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.08em] text-zinc-600">{diagnosticLabel(diagnostic.category)}</span>
        </div>
        <small className="mt-0.5 block text-[9px] text-zinc-700">Completed in {diagnostic.durationMs} ms</small>
      </div>
      <button type="button" onClick={onRun} disabled={loading} title="Run diagnostics again" className="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-40">
        {loading ? <LoaderCircle size={12} className="animate-spin" /> : <RotateCw size={12} />}
      </button>
    </div>

    <div className="mt-2.5 grid gap-1">
      {diagnostic.steps.map((step) => <div key={step.id} className="rounded-lg border border-white/[0.045] bg-black/10 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <DiagnosticStepIcon state={step.state} />
          <strong className="min-w-0 flex-1 truncate text-[9.5px] font-medium text-zinc-400">{step.label}</strong>
          {step.durationMs > 0 && <span className="font-mono text-[8.5px] text-zinc-700">{step.durationMs} ms</span>}
        </div>
        <p className="mt-1 break-words text-[9px] leading-4 text-zinc-650 text-zinc-600">{step.detail}</p>
      </div>)}
    </div>

    {diagnostic.recommendation && <div className="mt-2.5 rounded-lg border border-[#6f91ff]/10 bg-[#4f7cff]/[0.035] px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.09em] text-[#829dff]/70"><Activity size={10} /> Recommended action</div>
      <p className="text-[9.5px] leading-4 text-zinc-500">{diagnostic.recommendation}</p>
    </div>}
  </section>;
}

export function SftpBrowser({ servers, selectedServerId, onSelectServer }: Props) {
  const [serverId, setServerId] = useState(selectedServerId ?? servers[0]?.id ?? "");
  const [path, setPath] = useState(".");
  const [pathDraft, setPathDraft] = useState(".");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [diagnostic, setDiagnostic] = useState<SftpDiagnostic | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const { startDownload, startUpload } = useTransfers();

  const server = useMemo(() => servers.find((value) => value.id === serverId) ?? null, [serverId, servers]);

  useEffect(() => {
    if (selectedServerId && servers.some((value) => value.id === selectedServerId)) {
      setServerId(selectedServerId);
      return;
    }
    if (!servers.some((value) => value.id === serverId)) setServerId(servers[0]?.id ?? "");
  }, [selectedServerId, serverId, servers]);

  async function runDiagnostics() {
    if (!serverId || diagnosing) return;
    setDiagnosing(true);
    try {
      const result = await invoke<SftpDiagnostic>("sftp_diagnose", { serverId });
      setDiagnostic(result);
    } catch (value) {
      setDiagnostic({
        serverId,
        state: "failed",
        category: "diagnostics",
        summary: "Could not run SFTP diagnostics",
        recommendation: "Restart SSHDeck and verify that the system OpenSSH client is available.",
        checkedAt: Math.floor(Date.now() / 1000),
        durationMs: 0,
        steps: [{ id: "diagnostics", label: "Diagnostics runner", state: "failed", durationMs: 0, detail: String(value) }],
      });
    } finally {
      setDiagnosing(false);
    }
  }

  async function load(target = path) {
    if (!serverId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await invoke<SftpEntry[]>("sftp_list_directory", { serverId, path: target });
      setEntries(next);
      setPath(target);
      setPathDraft(target);
    } catch (value) {
      setEntries([]);
      setError(String(value));
      if (!diagnostic && !diagnosing) void runDiagnostics();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverId) return;
    setPath(".");
    setPathDraft(".");
    setDiagnostic(null);
    void load(".");
    // load is intentionally keyed by the selected server only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  function selectServer(nextId: string) {
    setDiagnostic(null);
    setServerId(nextId);
    onSelectServer(nextId);
  }

  async function commitEditor() {
    if (!editor || !serverId) return;
    const value = editor.value.trim();
    if (!value) return;
    setError(null);
    try {
      if (editor.kind === "mkdir") {
        await invoke("sftp_create_directory", { serverId, path: joinRemote(path, value) });
      } else {
        await invoke("sftp_rename", {
          serverId,
          oldPath: editor.entry.path,
          newPath: joinRemote(path, value),
        });
      }
      setEditor(null);
      await load();
    } catch (valueError) {
      setError(String(valueError));
    }
  }

  async function removeEntry(entry: SftpEntry) {
    if (!serverId) return;
    const description = entry.kind === "directory"
      ? `Remove empty directory “${entry.name}”? SSHDeck will not recursively delete its contents.`
      : `Delete remote file “${entry.name}”?`;
    if (!window.confirm(description)) return;
    setError(null);
    try {
      await invoke("sftp_remove", {
        serverId,
        path: entry.path,
        isDirectory: entry.kind === "directory",
      });
      await load();
    } catch (value) {
      setError(String(value));
    }
  }

  async function uploadFile() {
    if (!serverId) return;
    const selected = await open({ multiple: false, directory: false });
    if (!selected || Array.isArray(selected)) return;
    try {
      await startUpload(serverId, selected, path);
    } catch (value) {
      setError(String(value));
    }
  }

  async function downloadEntry(entry: SftpEntry) {
    if (!serverId || entry.kind === "directory") return;
    const destination = await save({ defaultPath: entry.name });
    if (!destination) return;
    try {
      await startDownload(serverId, entry.path, destination);
    } catch (value) {
      setError(String(value));
    }
  }

  if (servers.length === 0) {
    return <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <Folder size={22} className="text-zinc-700" />
      <strong className="mt-3 text-[12px] font-medium text-zinc-400">No SFTP target</strong>
      <span className="mt-1 text-[11px] leading-5 text-zinc-700">Add a server first, then open Remote Files again.</span>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="border-b border-white/[0.055] px-3 pb-3 pt-3.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-600">Remote files</span>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={serverId}
          onChange={(event) => selectServer(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.065] bg-[#090b0f] px-2 text-[11px] text-zinc-300 outline-none focus:border-[#5f86ff]/45"
        >
          {servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Button isIconOnly aria-label="Run SFTP diagnostics" onPress={() => void runDiagnostics()} className="size-8 min-w-8 rounded-lg border border-white/[0.065] bg-white/[0.025] text-zinc-400">{diagnosing ? <LoaderCircle size={14} className="animate-spin" /> : <Activity size={14} />}</Button>
        <Button isIconOnly aria-label="Upload file" onPress={() => void uploadFile()} className="size-8 min-w-8 rounded-lg border border-white/[0.065] bg-white/[0.025] text-zinc-400"><ArrowUpFromLine size={14} /></Button>
      </div>
      <form className="mt-2 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); void load(pathDraft.trim() || "."); }}>
        <Button isIconOnly aria-label="Parent directory" onPress={() => void load(parentPath(path))} className="size-8 min-w-8 rounded-lg bg-transparent text-zinc-500 hover:bg-white/[0.04]"><ChevronLeft size={15} /></Button>
        <input value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.065] bg-[#090b0f] px-2.5 font-mono text-[10.5px] text-zinc-400 outline-none focus:border-[#5f86ff]/45" />
        <Button isIconOnly aria-label="Refresh directory" onPress={() => void load()} className="size-8 min-w-8 rounded-lg bg-transparent text-zinc-500 hover:bg-white/[0.04]">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}</Button>
      </form>
      <div className="mt-2 flex items-center justify-between">
        <span className="truncate text-[10px] text-zinc-700">{server?.host}</span>
        <button type="button" onClick={() => setEditor({ kind: "mkdir", value: "" })} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"><FolderPlus size={12} /> New folder</button>
      </div>
    </header>

    {editor && <div className="border-b border-white/[0.05] bg-white/[0.018] p-2.5">
      <div className="mb-1.5 text-[10px] font-medium text-zinc-500">{editor.kind === "mkdir" ? "New folder" : `Rename ${editor.entry.name}`}</div>
      <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); void commitEditor(); }}>
        <input autoFocus value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value } as EditorState)} className="h-8 min-w-0 flex-1 rounded-lg border border-[#5f86ff]/30 bg-[#090b0f] px-2.5 text-[11px] text-zinc-300 outline-none" />
        <Button isIconOnly type="submit" aria-label="Save" className="size-8 min-w-8 rounded-lg bg-[#4f7cff] text-white"><Check size={14} /></Button>
        <Button isIconOnly aria-label="Cancel" onPress={() => setEditor(null)} className="size-8 min-w-8 rounded-lg bg-transparent text-zinc-500"><X size={14} /></Button>
      </form>
    </div>}

    {error && <div className="border-b border-rose-400/10 bg-rose-400/[0.05] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <CircleX size={13} className="mt-0.5 shrink-0 text-rose-400/80" />
        <div className="min-w-0 flex-1"><strong className="block text-[10px] font-semibold text-rose-300/90">SFTP request failed</strong><p className="mt-0.5 break-words text-[9.5px] leading-4 text-rose-300/65">{error}</p></div>
        <button type="button" onClick={() => void runDiagnostics()} disabled={diagnosing} className="shrink-0 rounded-md border border-rose-400/10 bg-rose-400/[0.04] px-2 py-1 text-[9px] font-medium text-rose-200/70 hover:bg-rose-400/[0.08] disabled:opacity-40">Diagnose</button>
      </div>
    </div>}

    <DiagnosticsCard diagnostic={diagnostic} loading={diagnosing} onRun={() => void runDiagnostics()} />

    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-color:rgba(255,255,255,.11)_transparent] [scrollbar-width:thin]">
      {!loading && entries.length === 0 && !error && <div className="px-3 py-8 text-center text-[11px] text-zinc-700">Directory is empty.</div>}
      {entries.map((entry) => <div key={entry.path} className="group flex min-h-11 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-white/[0.035]">
        <button
          type="button"
          onDoubleClick={() => { if (entry.kind === "directory") void load(entry.path); }}
          onClick={() => { if (entry.kind === "directory") void load(entry.path); }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={entry.path}
        >
          <span className="grid size-7 shrink-0 place-items-center"><EntryIcon kind={entry.kind} /></span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[11.5px] font-medium text-zinc-300">{entry.name}</strong>
            <small className="mt-0.5 block truncate font-mono text-[9.5px] text-zinc-700">{entry.kind === "directory" ? entry.permissions : `${formatBytes(entry.size)} · ${entry.modified}`}</small>
          </span>
        </button>
        <div className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
          {entry.kind !== "directory" && <button type="button" title="Download" className="grid size-6 place-items-center rounded-md text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300" onClick={() => void downloadEntry(entry)}><ArrowDownToLine size={12} /></button>}
          <button type="button" title="Rename" className="grid size-6 place-items-center rounded-md text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300" onClick={() => setEditor({ kind: "rename", entry, value: entry.name })}><Pencil size={11} /></button>
          <button type="button" title="Delete" className="grid size-6 place-items-center rounded-md text-zinc-600 hover:bg-rose-400/10 hover:text-rose-300" onClick={() => void removeEntry(entry)}><Trash2 size={11} /></button>
        </div>
      </div>)}
    </div>

  </div>;
}
