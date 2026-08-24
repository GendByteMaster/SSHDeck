import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./design-system.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./performance.css";
import "./keyboard.css";
import "./globals.css";
import { App } from "./App";
import { CommandPalette } from "./CommandPalette";
import { WorkbenchChrome } from "./WorkbenchChrome";
import { WorkbenchProvider } from "./WorkbenchContext";
import { installKeyboardNavigation } from "./keyboard";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <WorkbenchProvider>
    <App />
    <WorkbenchChrome />
    <CommandPalette />
  </WorkbenchProvider>,
);

const uninstallKeyboardNavigation = installKeyboardNavigation();
window.addEventListener("beforeunload", uninstallKeyboardNavigation, { once: true });
