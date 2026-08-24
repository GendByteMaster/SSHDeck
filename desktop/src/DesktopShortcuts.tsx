import { AnimatePresence, motion } from "motion/react";
import { Keyboard, X } from "lucide-react";
import { useMemo } from "react";
import { useCommands } from "./commands/CommandService";

export function DesktopShortcuts() {
  const { commands, shortcutsOpen, setShortcutsOpen } = useCommands();
  const shortcuts = useMemo(
    () => commands.filter((command) => command.readiness !== "planned" && command.shortcut && command.id !== "workbench.shortcuts.open"),
    [commands],
  );

  return <AnimatePresence>
    {shortcutsOpen && <motion.div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-5 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.99 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.09] bg-[#11151b] shadow-[0_28px_100px_rgba(0,0,0,.58)]"
      >
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl bg-[#4f7cff]/12 text-[#8da7ff]"><Keyboard size={17} /></span>
          <div className="min-w-0 flex-1">
            <strong className="block text-[14px] font-semibold text-zinc-100">Keyboard shortcuts</strong>
            <span className="text-[11px] text-zinc-600">Driven by SSHDeck CommandService</span>
          </div>
          <button type="button" onClick={() => setShortcutsOpen(false)} className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"><X size={15} /></button>
        </header>
        <div className="grid max-h-[480px] grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 overflow-y-auto p-3 [scrollbar-width:thin]">
          {shortcuts.map((command) => <div key={command.id} className="contents">
            <span className="rounded-lg px-3 py-2 text-[12px] text-zinc-400">{command.title}</span>
            <kbd className="my-1 self-center rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">{command.shortcut}</kbd>
          </div>)}
          <span className="rounded-lg px-3 py-2 text-[12px] text-zinc-400">Keyboard shortcuts</span>
          <kbd className="my-1 self-center rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">F1</kbd>
        </div>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
