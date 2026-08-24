import { Button } from "@heroui/react";
import { AnimatePresence, motion } from "motion/react";
import {
  Braces,
  Cable,
  ChevronDown,
  ChevronUp,
  PanelBottom,
  PanelLeftClose,
  PanelRightClose,
  UploadCloud,
} from "lucide-react";
import { CommandId, useCommands } from "./commands/CommandService";
import { TransfersPanel } from "./TransfersPanel";
import { useWorkbench } from "./WorkbenchContext";
import { PanelFeatureId, productionPanelFeatures } from "./workbenchFeatures";

const panelIcons: Record<PanelFeatureId, typeof UploadCloud> = {
  ports: Cable,
  logs: Braces,
  transfers: UploadCloud,
};

const panelCommands: Partial<Record<PanelFeatureId, CommandId>> = {
  transfers: "workbench.panel.transfers",
};

const panelTabs = productionPanelFeatures().flatMap((feature) => {
  const command = panelCommands[feature.id];
  if (!command) return [];
  return [{ ...feature, command, icon: panelIcons[feature.id] }];
});

function stateDotClass(state: string) {
  if (state === "active") return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.3)]";
  if (state === "reconnecting") return "bg-amber-400";
  if (state === "failed") return "bg-rose-400";
  if (state === "disconnected") return "bg-zinc-500";
  return "bg-zinc-600";
}

export function WorkbenchChrome() {
  const { panelVisible, panelTab, session } = useWorkbench();
  const { execute } = useCommands();

  return <>
    <AnimatePresence initial={false}>
      {panelVisible && <motion.section key="bottom-panel" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="wb-bottom-panel fixed inset-x-0 z-20 grid border-t border-white/[0.07] bg-[#0c0f14]/98 shadow-[0_-16px_40px_rgba(0,0,0,.24)] backdrop-blur-xl" style={{ bottom: "var(--wb-statusbar-height)", height: "var(--wb-panel-height)", gridTemplateRows: "42px minmax(0,1fr)" }} aria-label="Workbench panel">
        <header className="flex min-w-0 items-center gap-1 border-b border-white/[0.055] px-2">
          {panelTabs.map(({ id, label, icon: Icon, command }) => <button key={id} type="button" onClick={() => void execute(command)} className={`relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium transition-colors ${panelTab === id ? "bg-[#4f7cff]/12 text-zinc-100" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}><Icon size={14} /> {label}{panelTab === id && <motion.span layoutId="panel-tab-indicator" className="absolute inset-x-2 -bottom-[5px] h-px bg-[#6c8dff]" />}</button>)}
          <span className="flex-1" />
          <Button isIconOnly aria-label="Hide panel" onPress={() => void execute("workbench.panel.toggle")} className="size-8 min-w-8 rounded-lg bg-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"><ChevronDown size={15} /></Button>
        </header>
        <TransfersPanel />
      </motion.section>}
    </AnimatePresence>

    <footer className="wb-statusbar fixed inset-x-0 bottom-0 z-30 flex h-7 select-none items-center gap-3 border-t border-white/[0.065] bg-[#0a0d12]/98 px-2.5 text-[10.5px] text-zinc-500 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 capitalize"><span className={`size-1.5 rounded-full ${stateDotClass(session.state)}`} />{session.state === "idle" ? "No session" : session.state}</div>
      <span className="max-w-64 truncate text-zinc-400">{session.name}</span>
      <span className="hidden sm:inline">OpenSSH</span>
      {session.latency && <span className="hidden sm:inline">{session.latency}</span>}
      <span className="flex-1" />
      <button className="flex h-5 items-center gap-1 rounded-md px-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200" title="Toggle Servers (Ctrl+B)" onClick={() => void execute("workbench.primarySidebar.toggle")}><PanelLeftClose size={13} /><span className="hidden md:inline">Servers</span></button>
      <button className="flex h-5 items-center gap-1 rounded-md px-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200" title="Toggle Inspector (Ctrl+Alt+B)" onClick={() => void execute("workbench.secondarySidebar.toggle")}><PanelRightClose size={13} /><span className="hidden md:inline">Inspector</span></button>
      <button className="flex h-5 items-center gap-1 rounded-md px-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200" title="Toggle Panel (Ctrl+J)" onClick={() => void execute("workbench.panel.toggle")}><PanelBottom size={13} />{panelVisible ? <ChevronDown size={11} /> : <ChevronUp size={11} />}</button>
    </footer>
  </>;
}
