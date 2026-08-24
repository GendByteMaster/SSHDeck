import { useEffect } from "react";
import { CommandId, useCommands } from "./CommandService";

type Binding = {
  command: CommandId;
  matches: (event: KeyboardEvent) => boolean;
  allowInEditable?: boolean;
  allowInTerminal?: boolean;
};

const mod = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;
const key = (value: string) => (event: KeyboardEvent) => event.key.toLowerCase() === value;

const bindings: Binding[] = [
  { command: "workbench.commandPalette.open", matches: (event) => mod(event) && event.shiftKey && key("p")(event), allowInEditable: true, allowInTerminal: true },
  { command: "workbench.shortcuts.open", matches: (event) => event.key === "F1", allowInEditable: true, allowInTerminal: true },
  { command: "server.add", matches: (event) => mod(event) && event.shiftKey && key("n")(event) },
  { command: "server.focusSearch", matches: (event) => mod(event) && event.shiftKey && key("k")(event) },
  { command: "session.next", matches: (event) => event.ctrlKey && !event.shiftKey && !event.altKey && event.key === "Tab", allowInTerminal: true },
  { command: "session.previous", matches: (event) => event.ctrlKey && event.shiftKey && !event.altKey && event.key === "Tab", allowInTerminal: true },
  { command: "session.close", matches: (event) => mod(event) && event.shiftKey && key("w")(event), allowInTerminal: true },
  { command: "session.reconnect", matches: (event) => mod(event) && event.shiftKey && key("r")(event), allowInTerminal: true },
  { command: "workbench.primarySidebar.toggle", matches: (event) => mod(event) && !event.shiftKey && !event.altKey && key("b")(event) },
  { command: "workbench.secondarySidebar.toggle", matches: (event) => mod(event) && !event.shiftKey && event.altKey && key("b")(event) },
  { command: "workbench.panel.toggle", matches: (event) => mod(event) && !event.shiftKey && !event.altKey && key("j")(event) },
  ...Array.from({ length: 9 }, (_, index): Binding => ({
    command: `session.select.${index + 1}` as CommandId,
    matches: (event) => mod(event) && !event.shiftKey && !event.altKey && event.key === String(index + 1),
  })),
];

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isTerminal(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(".xterm"));
}

function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function KeybindingService() {
  const { execute, getCommand } = useCommands();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditable(event.target);
      const terminal = isTerminal(event.target);

      for (const binding of bindings) {
        if (!binding.matches(event)) continue;
        if (editable && !binding.allowInEditable) return;
        if (terminal && !binding.allowInTerminal) return;

        const command = getCommand(binding.command);
        if (!command || command.readiness === "planned" || !command.enabled) return;

        consume(event);
        void execute(binding.command);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [execute, getCommand]);

  return null;
}
