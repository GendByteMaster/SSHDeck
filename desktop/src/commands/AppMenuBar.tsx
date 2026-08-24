import {
  ChevronDown,
  CircleHelp,
  Command,
  Network,
  Search,
  Server,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandDefinition, CommandId, useCommands } from "./CommandService";

type MenuGroupId = "servers" | "sessions" | "tunnels" | "view" | "help";

type MenuGroup = {
  id: MenuGroupId;
  label: string;
  icon: typeof Server;
};

const groups: MenuGroup[] = [
  { id: "servers", label: "Servers", icon: Server },
  { id: "sessions", label: "Sessions", icon: TerminalSquare },
  { id: "tunnels", label: "Tunnels", icon: Network },
  { id: "view", label: "View", icon: Command },
  { id: "help", label: "Help", icon: CircleHelp },
];

const helpCommandIds = new Set<CommandId>([
  "workbench.commandPalette.open",
  "workbench.shortcuts.open",
]);

function isMacOs() {
  return /Macintosh|Mac OS X/.test(navigator.userAgent);
}

function visibleInMenu(command: CommandDefinition) {
  return command.readiness !== "planned" && !command.id.startsWith("session.select.");
}

function commandsForGroup(group: MenuGroupId, commands: CommandDefinition[]) {
  const visible = commands.filter(visibleInMenu);
  if (group === "servers") return visible.filter((command) => command.category === "Servers");
  if (group === "sessions") return visible.filter((command) => command.category === "Sessions");
  if (group === "tunnels") return visible.filter((command) => command.category === "Tunnels");
  if (group === "help") return visible.filter((command) => helpCommandIds.has(command.id));
  return visible.filter((command) =>
    (command.category === "Workbench" && !helpCommandIds.has(command.id)) || command.category === "Panel"
  );
}

function Shortcut({ value }: { value?: string }) {
  if (!value) return null;
  return <span className="ml-5 shrink-0 font-mono text-[9.5px] tracking-tight text-zinc-600">{value}</span>;
}

function MenuItems({
  group,
  commands,
  execute,
  close,
}: {
  group: MenuGroupId;
  commands: CommandDefinition[];
  execute: (id: CommandId) => Promise<boolean>;
  close: () => void;
}) {
  const items = commandsForGroup(group, commands);
  let previousCategory: CommandDefinition["category"] | null = null;

  return <div role="menu" className="min-w-[286px] overflow-hidden rounded-xl border border-white/[0.09] bg-[#11151b]/[0.985] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.48)] backdrop-blur-2xl">
    {items.map((command) => {
      const divider = group === "view" && previousCategory !== null && previousCategory !== command.category;
      previousCategory = command.category;
      return <div key={command.id}>
        {divider && <div className="mx-2 my-1 h-px bg-white/[0.065]" />}
        <button
          type="button"
          role="menuitem"
          disabled={!command.enabled}
          onClick={() => {
            close();
            void execute(command.id);
          }}
          className="group flex w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors enabled:hover:bg-white/[0.055] disabled:cursor-default disabled:opacity-35"
        >
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[11.5px] font-medium text-zinc-200">{command.title}</strong>
            <small className="mt-0.5 block truncate text-[9.5px] leading-4 text-zinc-600">{command.description}</small>
          </span>
          <Shortcut value={command.shortcut} />
        </button>
      </div>;
    })}
  </div>;
}

export function AppMenuBar() {
  const { commands, execute } = useCommands();
  const [openGroup, setOpenGroup] = useState<MenuGroupId | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const macOs = useMemo(isMacOs, []);

  useEffect(() => {
    if (macOs) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenGroup(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenGroup(null);
    };
    const closeOnBlur = () => setOpenGroup(null);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [macOs]);

  if (macOs) return null;

  return <header
    ref={rootRef}
    className="sshdeck-menu-bar fixed inset-x-0 top-0 z-50 flex h-[36px] select-none items-center border-b border-white/[0.065] bg-[#0a0d12]/[0.985] px-2 text-zinc-400 shadow-[0_1px_0_rgba(0,0,0,.35)] backdrop-blur-xl"
    aria-label="SSHDeck application menu"
  >
    <nav className="flex h-full items-center gap-0.5" aria-label="Application commands">
      {groups.map(({ id, label, icon: Icon }) => {
        const open = openGroup === id;
        return <div key={id} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpenGroup((current) => current === id ? null : id)}
            onPointerEnter={() => { if (openGroup) setOpenGroup(id); }}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors ${open ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}
          >
            <Icon size={13} strokeWidth={1.8} className="text-zinc-600" />
            {label}
            <ChevronDown size={10} className={`text-zinc-700 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && <div className="absolute left-0 top-[31px] pt-1">
            <MenuItems group={id} commands={commands} execute={execute} close={() => setOpenGroup(null)} />
          </div>}
        </div>;
      })}
    </nav>

    <span className="flex-1" />
    <button
      type="button"
      onClick={() => {
        setOpenGroup(null);
        void execute("workbench.commandPalette.open");
      }}
      className="flex h-7 min-w-0 items-center gap-2 rounded-lg border border-white/[0.055] bg-white/[0.025] px-2.5 text-[10.5px] text-zinc-600 transition-colors hover:border-white/[0.09] hover:bg-white/[0.045] hover:text-zinc-400"
      title="Show Command Palette"
    >
      <Search size={12} />
      <span className="hidden truncate min-[900px]:inline">Command Palette</span>
      <span className="hidden font-mono text-[9px] text-zinc-700 min-[1120px]:inline">Ctrl+Shift+P</span>
    </button>
  </header>;
}
