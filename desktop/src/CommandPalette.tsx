import { Button as HeroButton } from "@heroui/react";
import { Command, Download, PanelBottom, PanelLeftClose, PanelRightClose, Plus, Search, TerminalSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandDefinition, CommandId, useCommands } from "./commands/CommandService";

function commandIcon(id: CommandId) {
  if (id === "server.add") return Plus;
  if (id === "server.importOpenSsh") return Download;
  if (id === "server.focusSearch") return Search;
  if (id === "workbench.primarySidebar.toggle") return PanelLeftClose;
  if (id === "workbench.secondarySidebar.toggle") return PanelRightClose;
  if (id.startsWith("workbench.panel")) return PanelBottom;
  if (id.startsWith("session.select")) return TerminalSquare;
  return Command;
}

function firstEnabledIndex(items: CommandDefinition[]) {
  const index = items.findIndex((item) => item.enabled);
  return index >= 0 ? index : 0;
}

export function CommandPalette() {
  const { commands, paletteOpen, setPaletteOpen, execute } = useCommands();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const visibleCommands = useMemo(
    () => commands.filter((command) => command.id !== "workbench.commandPalette.open" && command.readiness !== "planned"),
    [commands],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return visibleCommands;
    return visibleCommands.filter((item) => `${item.title} ${item.description} ${item.category} ${item.availabilityReason ?? ""}`.toLowerCase().includes(needle));
  }, [query, visibleCommands]);

  useEffect(() => {
    if (!paletteOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      const previous = previousFocusRef.current;
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
      });
    };
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    if (!filtered[activeIndex]?.enabled) setActiveIndex(firstEnabledIndex(filtered));
  }, [activeIndex, filtered, paletteOpen]);

  async function run(item: CommandDefinition) {
    if (!item.enabled) return;
    setPaletteOpen(false);
    await execute(item.id);
  }

  function moveActive(direction: 1 | -1) {
    if (filtered.length === 0) return;
    let index = activeIndex;
    for (let offset = 0; offset < filtered.length; offset += 1) {
      index = (index + direction + filtered.length) % filtered.length;
      if (filtered[index]?.enabled) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setPaletteOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && filtered[activeIndex]?.enabled) {
      event.preventDefault();
      void run(filtered[activeIndex]);
    }
  }

  return <AnimatePresence>
    {paletteOpen && (
      <motion.div
        className="fixed inset-0 z-[80] flex items-start justify-center bg-black/35 px-4 pt-[11vh] backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}
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
              const Icon = commandIcon(item.id);
              const active = item.enabled && index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.enabled}
                  title={item.enabled ? item.description : item.availabilityReason ?? item.description}
                  onMouseEnter={() => { if (item.enabled) setActiveIndex(index); }}
                  onClick={() => void run(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-[#4f7cff]/12" : "enabled:hover:bg-white/[0.035]"}`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${active ? "border-[#6f91ff]/20 bg-[#4f7cff]/10 text-[#9bb1ff]" : "border-white/[0.055] bg-white/[0.025] text-zinc-500"}`}>
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[12.5px] font-medium text-zinc-200">{item.title}</strong>
                    <small className="mt-0.5 block truncate text-[10.5px] text-zinc-600">{item.enabled ? `${item.category} · ${item.description}` : `${item.category} · ${item.availabilityReason ?? item.description}`}</small>
                  </span>
                  {item.shortcut && <kbd className="shrink-0 rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[10px] text-zinc-600">{item.shortcut}</kbd>}
                </button>
              );
            })}
            {filtered.length === 0 && <div className="px-4 py-10 text-center text-[12px] text-zinc-600">No matching commands.</div>}
          </div>

          <footer className="flex items-center justify-between border-t border-white/[0.05] px-3 py-2 text-[10px] text-zinc-700">
            <span>↑↓ Navigate · Enter Run</span>
            <HeroButton onPress={() => setPaletteOpen(false)} className="h-7 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 text-[10px] text-zinc-500">Close</HeroButton>
          </footer>
        </motion.section>
      </motion.div>
    )}
  </AnimatePresence>;
}
