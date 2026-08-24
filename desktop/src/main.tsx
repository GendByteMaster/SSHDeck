import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./design-system.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./performance.css";
import "./globals.css";
import { App } from "./App";
import { CommandPalette } from "./CommandPalette";
import { CommandProvider } from "./commands/CommandService";
import { KeybindingService } from "./commands/KeybindingService";
import { DesktopShortcuts } from "./DesktopShortcuts";
import { WorkbenchChrome } from "./WorkbenchChrome";
import { WorkbenchProvider } from "./WorkbenchContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <WorkbenchProvider>
    <CommandProvider>
      <KeybindingService />
      <App />
      <WorkbenchChrome />
      <CommandPalette />
      <DesktopShortcuts />
    </CommandProvider>
  </WorkbenchProvider>,
);
