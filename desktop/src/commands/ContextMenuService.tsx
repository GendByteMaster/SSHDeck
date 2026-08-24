import { Menu } from "@tauri-apps/api/menu";
import { useCallback } from "react";
import { CommandId, useCommands } from "./CommandService";

export function useCommandContextMenu() {
  const { getCommand, execute } = useCommands();

  return useCallback(async (ids: CommandId[]) => {
    const commands = ids
      .map((id) => getCommand(id))
      .filter((command): command is NonNullable<typeof command> => Boolean(command) && command?.readiness !== "planned");

    if (commands.length === 0) return;

    const menu = await Menu.new({
      items: commands.map((command) => ({
        id: `sshdeck.context.${command.id}`,
        text: command.title,
        enabled: command.enabled,
        action: () => { void execute(command.id); },
      })),
    });

    try {
      await menu.popup();
    } finally {
      await menu.close();
    }
  }, [execute, getCommand]);
}
