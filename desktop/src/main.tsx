import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./design-system.css";
import "./styles.css";
import "./sessionLifecycle.css";
import "./performance.css";
import "./globals.css";
import "./workbenchMenu.css";
import { App } from "./App";
import { CommandPalette } from "./CommandPalette";
import { DesktopShortcuts } from "./DesktopShortcuts";
import { LogProvider } from "./LogContext";
import { SessionProvider } from "./SessionContext";
import { TunnelProvider } from "./TunnelContext";
import { TransferProvider } from "./TransferContext";
import { WorkbenchChrome } from "./WorkbenchChrome";
import { WorkbenchProvider } from "./WorkbenchContext";
import { AppMenuBar } from "./commands/AppMenuBar";
import { CommandProvider } from "./commands/CommandService";
import { KeybindingService } from "./commands/KeybindingService";
import { NativeMenu } from "./commands/NativeMenu";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <WorkbenchProvider>
    <LogProvider>
      <SessionProvider>
        <TunnelProvider>
          <TransferProvider>
            <CommandProvider>
              <KeybindingService />
              <NativeMenu />
              <AppMenuBar />
              <App />
              <WorkbenchChrome />
              <CommandPalette />
              <DesktopShortcuts />
            </CommandProvider>
          </TransferProvider>
        </TunnelProvider>
      </SessionProvider>
    </LogProvider>
  </WorkbenchProvider>,
);
