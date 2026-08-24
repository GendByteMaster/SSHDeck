import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./design-system.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./apple.css";
import "./design-components.css";
import "./ui-v2.css";
import "./performance.css";
import "./keyboard.css";
import "./globals.css";
import { App } from "./App";
import { WorkbenchChrome } from "./WorkbenchChrome";
import { installKeyboardNavigation } from "./keyboard";

ReactDOM.createRoot(document.getElementById("root")!).render(<><App /><WorkbenchChrome /></>);

const uninstallKeyboardNavigation = installKeyboardNavigation();
window.addEventListener("beforeunload", uninstallKeyboardNavigation, { once: true });
