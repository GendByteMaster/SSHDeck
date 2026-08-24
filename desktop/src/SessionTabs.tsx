import { RefreshCw, X } from "lucide-react";
import { useCommandContextMenu } from "./commands/ContextMenuService";
import { SessionView } from "./sessionLifecycle";

type Props = {
  tabs: SessionView[];
  activeId: string | null;
  onActivate: (tab: SessionView) => void;
  onReconnect: (tab: SessionView) => void;
  onClose: (tab: SessionView) => void;
};

export function SessionTabs({ tabs, activeId, onActivate, onReconnect, onClose }: Props) {
  const popupCommands = useCommandContextMenu();

  return <header className="topbar">
    <div className="tabs">
      {tabs.map((tab) => <button
        key={tab.id}
        type="button"
        className={`tab ${activeId === tab.id ? "active" : ""}`}
        onPointerDown={() => onActivate(tab)}
        onClick={() => onActivate(tab)}
        onContextMenu={(event) => {
          event.preventDefault();
          onActivate(tab);
          void popupCommands(["session.reconnect", "session.close"]);
        }}
      >
        <span className={`session-dot ${tab.state}`} />
        <span>{tab.name}</span>
        <RefreshCw
          size={12}
          className={tab.state === "reconnecting" ? "spin" : ""}
          onClick={(event) => {
            event.stopPropagation();
            onReconnect(tab);
          }}
        />
        <X
          size={13}
          onClick={(event) => {
            event.stopPropagation();
            onClose(tab);
          }}
        />
      </button>)}
    </div>
  </header>;
}
