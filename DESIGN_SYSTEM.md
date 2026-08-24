# SSHDeck Design System

SSHDeck uses a keyboard-first, developer-focused desktop design system built around clarity, predictable state, and low visual noise.

## Principles

1. **Terminal first** — the terminal is the primary workspace. Navigation and tools support it rather than compete with it.
2. **State must be visible** — server health, session state, tunnel state, destructive actions, and reconnect behavior always have explicit visual feedback.
3. **Keyboard first** — every primary workflow must remain usable without a mouse.
4. **Desktop, not browser chrome** — avoid native browser dialogs and browser-specific controls. Use SSHDeck-owned modals, focus states, confirmation flows, and Tauri capabilities.
5. **Low-cost visuals** — prefer opaque/composited surfaces over persistent blur effects so the WebView2 UI remains responsive.
6. **Progressive density** — the terminal stays spacious, while side panels may use denser information layouts.

## Foundations

### Color

Semantic tokens live in `desktop/src/design-system.css`.

- `--ds-bg-canvas` — terminal/application background.
- `--ds-bg-surface-1..3` — progressively elevated surfaces.
- `--ds-text-primary` — primary readable text.
- `--ds-text-secondary` — secondary labels and values.
- `--ds-text-tertiary` — help text and metadata.
- `--ds-accent` — focus, primary actions, selection.
- `--ds-success` — connected/healthy/running.
- `--ds-warning` — authentication or attention required.
- `--ds-danger` — failed/destructive/error.
- `--ds-info` — checking/reconnecting/in-progress.

Never use status colors decoratively. A colored status must communicate actual state.

### Typography

UI font stack:

```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif
```

Terminal font stack:

```css
"JetBrains Mono", "Cascadia Code", ui-monospace, SFMono-Regular, monospace
```

Typography scale is tokenized from `--ds-text-xs` through `--ds-text-2xl`.

### Spacing

SSHDeck uses a 4 px base grid:

`4 / 8 / 12 / 16 / 20 / 24 / 32`.

Avoid arbitrary one-off spacing values unless required by xterm or platform behavior.

### Radius

- small: 8 px
- medium: 12 px
- large: 16 px
- modal: 22 px
- pill: fully rounded

### Control sizes

- compact: 32 px
- normal: 40 px
- primary form control: 46 px

Primary interactive targets should normally be at least 40 px high.

## Layout

Default desktop structure:

```text
┌ Sidebar ─┬──────────── Terminal workspace ────────────┬ Tools ┐
│ servers  │ tabs                                        │ state │
│ search   │                                             │ cmds  │
│ groups   │ real PTY / OpenSSH                         │ tunnel│
└──────────┴─────────────────────────────────────────────┴───────┘
```

Design tokens control sidebar, tools panel, and topbar sizing. The central terminal always receives remaining space.

## Component rules

### Buttons

- Primary: one dominant action per local context.
- Secondary: neutral actions.
- Danger: destructive actions only.
- Icon-only buttons require a tooltip/title and visible keyboard focus.

### Fields

- Labels are always visible; do not rely on placeholders as labels.
- Focus uses the accent ring.
- Password reveal is SSHDeck-owned; WebView2 native reveal controls are disabled.
- Secret contents must not be stored in plain project configuration.

### Status

Use both color and text/state meaning. Do not communicate state with color alone.

Examples:

- green + `Active`
- amber + `Auth required`
- red + `Failed`
- blue + `Reconnecting`

### Modals

- SSHDeck modals replace `alert`, `confirm`, and browser-native prompts.
- Escape closes the topmost dismissible modal.
- Destructive actions must be explicit.
- Forms should fit the default desktop window without unnecessary internal scrolling.

## Motion

Motion is short and functional. Default durations are 120–180 ms.

Respect `prefers-reduced-motion`.

Do not animate terminal content, live metrics, or large surfaces simply for decoration.

## Accessibility and keyboard contract

- All interactive controls require `:focus-visible` state.
- Shell shortcuts must not steal common terminal shortcuts such as `Ctrl+C`, `Ctrl+R`, or `Ctrl+L` while xterm has focus.
- Server rows and tabs must remain keyboard reachable.
- Text and status indicators should not depend solely on color.

## CSS architecture

```text
design-system.css      tokens and global primitives
styles.css             legacy/layout styles while migration is in progress
apple.css              current visual refinements; gradually migrate out
design-components.css  semantic design-system overrides
performance.css        rendering/performance-specific overrides
keyboard.css           keyboard navigation/help UI
sessionLifecycle.css   lifecycle-specific state presentation
```

New visual work should use `--ds-*` tokens. Do not add new hard-coded colors when an appropriate semantic token exists.

The migration target is to progressively shrink `styles.css` and `apple.css`, moving stable shared rules into `design-components.css` without a high-risk full rewrite.
