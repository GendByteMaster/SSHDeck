import { Button as HeroButton } from "@heroui/react";
import { Command, Download, PanelBottom, PanelLeftClose, PanelRightClose, Plus, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "./WorkbenchContext";

type PaletteCommand = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  shortcut?: string;
  run: () => void;
};

export function CommandPalette() {
  const {
    primaryVisible,
    secondaryVisible,
    panelVisible,
    setPrimaryVisible,
    setSecondaryVisible,
    setPanelVisible,
    requestAddServer,
    requestImportOpenSsh,
    requestFocusServerSearch,
  } = useWorkbench();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo<PaletteCommand[]>(() => [
    {
      id: "server-add",
      label: "Add Server",
      description: "Create a new SSHDeck server entry",
      icon: Plus,
      run: requestAddServer,
    },
    {
      id: "server-import",
      label: "Import OpenSSH",
      description: "Import aliases from your OpenSSH config",
      icon: Download,
      run: requestImportOpenSsh,
    },
    {
      id: "server-search",
      label: "Focus Server Search",
      description: "Move focus to the server filter",
      icon: Search,
      shortcut: "Ctrl+Shift+K",
      run: requestFocusServerSearch,
    },
    {
      id: "layout-primary",
      label: "Toggle Servers Sidebar",
      description: "Show or hide the primary sidebar",
      icon: PanelLeftClose,
      shortcut: "Ctrl+B",
      run: () => setPrimaryVisible(!primaryVisible),
    },
    {
      id: "layout-secondary",
      label: "Toggle Inspector",
      description: "Show or hide the contextual inspector",
      icon: PanelRightClose,
      shortcut: "Ctrl+Alt+B",
      run: () => setSecondaryVisible(!secondaryVisible),
    },
    {
      id: "layout-panel",
      label: "Toggle Bottom Panel",
      description: "Show or hide Terminal / Ports / Logs / Transfers",
      icon: PanelBottom,
      shortcut: "Ctrl+J",
      run: () => setPanelVisible(!panelVisible),
    },
  ], [panelVisible, primaryVisible, requestAddServer, requestFocusServerSearch, requestImportOpenSsh, secondaryVisible, setPanelVisible, setPrimaryVisible, setSecondaryVisible]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandPalette = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p";
      if (commandPalette) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (open && event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function run(item: PaletteCommand) {
    setOpen(false);
    item.run();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => Math.min(filtered.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      run(filtered[activeIndex]);
    }
  }

  return <AnimatePresence>
    {open && (
      <motion.div
        className="fixed inset-0 z-[80] flex items-start justify-center bg-black/35 px-4 pt-[11vh] backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          initial={{ opacity: 0, y: -8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.99 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#11141a]/98 shadow-[0_28px_100px_rgba(0,0,0,0.58)]"
        >
          <div className="flex h-13 items-center gap-3 border-b border-white/[0.06] px-4">
            <Command size={17} className="shrink-0 text-[#7897ff]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={onInputKeyDown}
              placeholder="Type a command…"
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <kbd className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-zinc-600">Esc</kbd>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2 [scrollbar-width:thin]">
            {filtered.map((item, index) => {
              const Icon = item.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-[#4f7cff]/12" : "hover:bg-white/[0.035]"}`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${active ? "border-[#6f91ff]/20 bg-[#4f7cff]/10 text-[#9bb1ff]" : "border-white/[0.055] bg-white/[0.025] text-zinc-500"}`}>
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[12.5px] font-medium text-zinc-200">{item.label}</strong>
                    <small className="mt-0.5 block truncate text-[10.5px] text-zinc-600">{item.description}</small>
                  </span>
                  {item.shortcut && <kbd className="shrink-0 rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[10px] text-zinc-600">{item.shortcut}</kbd>}
                </button>
              );
            })}
            {filtered.length === 0 && <div className="px-4 py-10 text-center text-[12px] text-zinc-600">No matching commands.</div>}
          </div>

          <footer className="flex items-center justify-between border-t border-white/[0.05] px-3 py-2 text-[10px] text-zinc-700">
            <span>↑↓ Navigate · Enter Run</span>
            <HeroButton onPress={() => setOpen(false)} className="h-7 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 text-[10px] text-zinc-500">Close</HeroButton>
          </footer>
        </motion.section>
      </motion.div>
    )}
  </AnimatePresence>;
}
