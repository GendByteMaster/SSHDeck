import { Menu } from "@tauri-apps/api/menu";
import { useEffect } from "react";
import { CommandCategory, CommandDefinition, useCommands } from "./CommandService";

const categoryOrder: CommandCategory[] = ["Servers", "Sessions", "Tunnels", "Workbench", "Panel"];

function isMacOs() {
  return /Macintosh|Mac OS X/.test(navigator.userAgent);
}

function accelerator(shortcut?: string) {
  if (!shortcut) return undefined;
  return shortcut
    .replace(/^Ctrl\+/i, "CmdOrCtrl+")
    .replace(/\+Ctrl\+/gi, "+CmdOrCtrl+");
}

function menuItem(command: CommandDefinition, execute: (id: CommandDefinition["id"]) => Promise<boolean>) {
  return {
    id: command.id,
    text: command.title,
    enabled: command.enabled,
    accelerator: accelerator(command.shortcut),
    action: () => { void execute(command.id); },
  };
}

export function NativeMenu() {
  const { commands, execute } = useCommands();

  useEffect(() => {
    // Windows and Linux use the integrated Workbench menu. macOS keeps the
    // platform-native application menu where users expect it.
    if (!isMacOs()) return;

    let disposed = false;
    let activeMenu: Menu | null = null;

    async function install() {
      const visibleCommands = commands.filter((command) => command.readiness !== "planned" && !command.id.startsWith("session.select."));
      const groups = categoryOrder
        .map((category) => ({
          category,
          commands: visibleCommands.filter((command) => command.category === category),
        }))
        .filter((group) => group.commands.length > 0);

      const menu = await Menu.new({
        id: "sshdeck.application-menu",
        items: groups.map(({ category, commands: items }) => ({
          id: `sshdeck.menu.${category.toLowerCase()}`,
          text: category,
          items: items.map((command) => menuItem(command, execute)),
        })),
      });

      if (disposed) {
        await menu.close();
        return;
      }
      activeMenu = menu;
      await menu.setAsAppMenu();
    }

    void install();
    return () => {
      disposed = true;
      if (activeMenu) void activeMenu.close();
    };
  }, [commands, execute]);

  return null;
}
