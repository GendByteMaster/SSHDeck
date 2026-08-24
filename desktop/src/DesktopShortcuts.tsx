import { AnimatePresence, motion } from "motion/react";
import { Keyboard, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkbench } from "./WorkbenchContext";

const shortcuts = [
  ["Command Palette", "Ctrl+Shift+P"],
  ["Search servers", "Ctrl+Shift+K"],
  ["Add server", "Ctrl+Shift+N"],
  ["Toggle Servers", "Ctrl+B"],
  ["Toggle Inspector", "Ctrl+Alt+B"],
  ["Toggle Bottom Panel", "Ctrl+J"],
  ["Session 1–9", "Ctrl+1…9"],
  ["Keyboard shortcuts", "F1"],
] as const;

export function DesktopShortcuts() {
  const {
    primaryVisible,
    secondaryVisible,
    panelVisible,
    setPrimaryVisible,
    setSecondaryVisible,
    setPanelVisible,
    requestAddServer,
    requestFocusServerSearch,
    requestSelectSession,
  } = useWorkbench();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      const inTerminal = target instanceof HTMLElement && Boolean(target.closest(".xterm"));
      const modifier = event.ctrlKey || event.metaKey;

      if (event.key === "F1") {
        event.preventDefault();
        setHelpOpen((value) => !value);
        return;
      }
      if (event.key === "Escape" && helpOpen) {
        event.preventDefault();
        setHelpOpen(false);
        return;
      }
      if (inTerminal && !(modifier && event.shiftKey)) return;
      if (editing && !(modifier && event.shiftKey)) return;

      const key = event.key.toLowerCase();
      if (modifier && event.shiftKey && key === "k") {
        event.preventDefault();
        requestFocusServerSearch();
      } else if (modifier && event.shiftKey && key === "n") {
        event.preventDefault();
        requestAddServer();
      } else if (modifier && !event.shiftKey && key === "b" && event.altKey) {
        event.preventDefault();
        setSecondaryVisible(!secondaryVisible);
      } else if (modifier && !event.shiftKey && key === "b") {
        event.preventDefault();
        setPrimaryVisible(!primaryVisible);
      } else if (modifier && !event.shiftKey && key === "j") {
        event.preventDefault();
        setPanelVisible(!panelVisible);
      } else if (modifier && !event.altKey && !event.shiftKey) {
        const index = Number(event.key);
        if (index >= 1 && index <= 9) {
          event.preventDefault();
          requestSelectSession(index - 1);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [helpOpen, panelVisible, primaryVisible, requestAddServer, requestFocusServerSearch, requestSelectSession, secondaryVisible, setPanelVisible, setPrimaryVisible, setSecondaryVisible]);

  return <AnimatePresence>
    {helpOpen && <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-5 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
      <motion.section role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-[#11151b] shadow-[0_28px_100px_rgba(0,0,0,.58)]">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl bg-[#4f7cff]/12 text-[#8da7ff]"><Keyboard size={17} /></span>
          <div className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold text-zinc-100">Keyboard shortcuts</strong><span className="text-[11px] text-zinc-600">SSHDeck desktop workbench</span></div>
          <button type="button" onClick={() => setHelpOpen(false)} className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"><X size={15} /></button>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 p-3">
          {shortcuts.map(([label, keys]) => <div key={label} className="contents"><span className="rounded-lg px-3 py-2 text-[12px] text-zinc-400">{label}</span><kbd className="my-1 self-center rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">{keys}</kbd></div>)}
        </div>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
