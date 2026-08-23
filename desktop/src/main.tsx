import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./apple.css";
import "./performance.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
