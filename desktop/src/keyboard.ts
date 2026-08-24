type Cleanup = () => void;

const isMac = navigator.platform.toLowerCase().includes("mac");
const modLabel = isMac ? "⌘⇧" : "Ctrl+Shift+";

function visible<T extends HTMLElement>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)].filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && !element.hasAttribute("disabled");
  });
}

function inTerminal(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".xterm"));
}

function inEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function click(element: Element | null) {
  if (element instanceof HTMLElement) element.click();
  else if (element) element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function buttonByText(text: string) {
  const needle = text.trim().toLowerCase();
  return [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim().toLowerCase() === needle) ?? null;
}

function activeTab() {
  return document.querySelector<HTMLElement>(".tab.active");
}

function activeTabAction(positionFromEnd: number) {
  const tab = activeTab();
  if (!tab) return;
  const icons = [...tab.querySelectorAll<SVGElement>("svg")];
  const target = icons.at(-positionFromEnd) ?? null;
  click(target);
}

function cycleTabs(backward: boolean) {
  const tabs = visible<HTMLElement>(".tab");
  if (tabs.length < 2) return;
  const current = tabs.findIndex((tab) => tab.classList.contains("active"));
  const index = current < 0
    ? 0
    : (current + (backward ? -1 : 1) + tabs.length) % tabs.length;
  tabs[index]?.click();
}

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Search servers"]');
  input?.focus();
  input?.select();
}

function serverRows() {
  return visible<HTMLButtonElement>(".workbench-primary .group > button.text-left");
}

function focusServer(delta = 0) {
  const rows = serverRows();
  if (rows.length === 0) return;
  const current = rows.findIndex((row) => row === document.activeElement);
  const base = current < 0 ? (delta < 0 ? 0 : -1) : current;
  const next = rows[(base + delta + rows.length) % rows.length];
  next?.focus();
}

const focusZones = [
  () => document.querySelector<HTMLElement>('input[placeholder="Search servers"]'),
  () => activeTab() ?? document.querySelector<HTMLElement>(".tabs .tab"),
  () => document.querySelector<HTMLElement>(".tools-panel button:not(:disabled)"),
  () => document.querySelector<HTMLElement>(".xterm-helper-textarea"),
];
let focusZone = -1;

function cycleFocus() {
  for (let offset = 1; offset <= focusZones.length; offset += 1) {
    const index = (focusZone + offset) % focusZones.length;
    const element = focusZones[index]?.();
    if (element) {
      focusZone = index;
      element.focus();
      return;
    }
  }
}

function closeTopLayer() {
  const modal = [...document.querySelectorAll<HTMLElement>(".modal-backdrop")].at(-1);
  if (modal) {
    click(modal.querySelector(".icon-button"));
    return true;
  }
  const toastClose = document.querySelector<HTMLElement>(".toast button");
  if (toastClose) {
    toastClose.click();
    return true;
  }
  return false;
}

function shortcutOverlay() {
  const existing = document.getElementById("sshdeck-shortcuts");
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "sshdeck-shortcuts";
  overlay.className = "keyboard-overlay";
  overlay.innerHTML = `
    <section class="keyboard-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <header><div><strong>Keyboard shortcuts</strong><span>SSHDeck navigation</span></div><button type="button" aria-label="Close">×</button></header>
      <div class="keyboard-shortcuts">
        <span>Command palette</span><kbd>${isMac ? "⌘⇧P" : "Ctrl+Shift+P"}</kbd>
        <span>Search servers</span><kbd>${modLabel}K</kbd>
        <span>Add server</span><kbd>${modLabel}N</kbd>
        <span>Next / previous tab</span><kbd>Ctrl+Tab / Ctrl+Shift+Tab</kbd>
        <span>Reconnect active tab</span><kbd>${modLabel}R</kbd>
        <span>Close active tab</span><kbd>${modLabel}W</kbd>
        <span>Cycle UI focus</span><kbd>F6</kbd>
        <span>Server up / down</span><kbd>↑ / ↓</kbd>
        <span>Connect focused server</span><kbd>Enter</kbd>
        <span>Close dialog / toast</span><kbd>Esc</kbd>
        <span>Show shortcuts</span><kbd>F1</kbd>
      </div>
      <p>Terminal shortcuts such as Ctrl+C, Ctrl+R, Ctrl+K and Ctrl+L are never intercepted while xterm has focus.</p>
    </section>`;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || (event.target instanceof Element && event.target.closest("header button"))) overlay.remove();
  });
  document.body.appendChild(overlay);
}

export function installKeyboardNavigation(): Cleanup {
  const onKeyDown = (event: KeyboardEvent) => {
    const terminalFocused = inTerminal(event.target);
    const editable = inEditable(event.target);
    const modifier = event.ctrlKey || event.metaKey;

    if (event.key === "F1") {
      event.preventDefault();
      shortcutOverlay();
      return;
    }

    if (event.key === "F6") {
      event.preventDefault();
      cycleFocus();
      return;
    }

    if (event.key === "Escape") {
      if (closeTopLayer()) event.preventDefault();
      return;
    }

    // Never steal ordinary shell control sequences from xterm.
    if (terminalFocused && !(modifier && event.shiftKey)) return;

    if (modifier && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusSearch();
      return;
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      click(buttonByText("Add server"));
      return;
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === "w") {
      event.preventDefault();
      activeTabAction(1);
      return;
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      activeTabAction(2);
      return;
    }
    if (event.ctrlKey && event.key === "Tab") {
      event.preventDefault();
      cycleTabs(event.shiftKey);
      return;
    }

    const sidebarFocused = event.target instanceof Element && Boolean(event.target.closest(".workbench-primary"));
    if (!editable && sidebarFocused && event.key === "ArrowDown") {
      event.preventDefault();
      focusServer(1);
    } else if (!editable && sidebarFocused && event.key === "ArrowUp") {
      event.preventDefault();
      focusServer(-1);
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.getElementById("sshdeck-shortcuts")?.remove();
  };
}
