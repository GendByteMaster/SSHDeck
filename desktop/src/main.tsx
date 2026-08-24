import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./design-system.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./apple.css";
import "./design-components.css";
import "./ui-v2.css";
import "./product-v2.css";
import "./tabbar-v2.css";
import "./inspector-v2.css";
import "./workspace-v3.css";
import "./performance.css";
import "./keyboard.css";
import "./workbench-v4.css";
import { App } from "./App";
import { installKeyboardNavigation } from "./keyboard";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

const uninstallKeyboardNavigation = installKeyboardNavigation();
window.addEventListener("beforeunload", uninstallKeyboardNavigation, { once: true });
