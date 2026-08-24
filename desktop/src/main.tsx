import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./design-system.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./apple.css";
import "./design-components.css";
import "./performance.css";
import "./keyboard.css";
import "./globals.css";
import { App } from "./App";
import { CommandPalette } from "./CommandPalette";
import { WorkbenchChrome } from "./WorkbenchChrome";
import { installKeyboardNavigation } from "./keyboard";

ReactDOM.createRoot(document.getElementById("root")!).render(<><App /><WorkbenchChrome /><CommandPalette /></>);

const uninstallKeyboardNavigation = installKeyboardNavigation();
window.addEventListener("beforeunload", uninstallKeyboardNavigation, { once: true });
