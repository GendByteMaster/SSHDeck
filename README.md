# SSHDeck

SSHDeck is a fast, local-first SSH workspace for developers. It keeps the proven OpenSSH toolchain and adds a focused desktop workflow for discovering servers, opening real terminal sessions, browsing remote files, managing transfers and tunnels, searching workspace state, and understanding connection/runtime diagnostics.

## What works now

SSHDeck has two layers:

- a reusable Rust CLI/core that uses the system OpenSSH client;
- a Tauri 2 desktop workspace with React, TypeScript, xterm.js, and real PTY-backed SSH sessions.

Existing `~/.ssh/config`, `ssh-agent`, `known_hosts`, `ProxyJump`, `IdentityFile`, certificates, and hardware-backed keys remain owned by OpenSSH instead of being copied into SSHDeck.

### Desktop features

- Add/Edit/Delete servers in an SSHDeck-local registry;
- import literal hosts from `~/.ssh/config` through `ssh -G`;
- safe OpenSSH snippet export without rewriting `~/.ssh/config`;
- Favorites, Groups, Recent, and server filtering;
- multiple PTY-backed SSH terminal tabs;
- real session lifecycle: active, reconnecting, disconnected, failed;
- duration, exit code, signal, bounded persisted connection history, manual reconnect, and optional auto-reconnect;
- dedicated Sessions and History workspaces with filtering, diagnostics, focus/reconnect controls, and safe history clearing;
- authenticated SSH server probes with online/auth-required/offline/error states, latency, and Linux uptime when available;
- Remote Files / SFTP browser with navigation, mkdir, rename, safe delete, upload, download, and staged TCP → SSH → SFTP diagnostics;
- transfer queue with queued/running/done/failed/cancelled states, cancel, retry, progress, speed, and ETA;
- Quick Commands scoped globally or to a server;
- Dangerous Command Protection with Standard/Strict policy, risk classification, and explicit confirmation;
- local (`-L`), remote (`-R`), and dynamic SOCKS (`-D`) forwarding;
- tunnel runtime health, stderr diagnostics, keepalives, and bounded auto-restart;
- structured Logs panel for SSH/session, reconnect, tunnel, transfer, and completed SFTP diagnostic events;
- bounded in-memory log retention with centralized credential/token/private-key redaction;
- Workbench Search across servers, sessions, history, tunnels, transfers, Quick Commands, and SSHDeck commands;
- versioned Settings persisted in `workspace.json`, including auto-reconnect defaults, diagnostic timeout, transfer concurrency, command-safety policy, and layout restore behavior;
- Activity Bar, primary workspace sidebar, contextual Inspector, Bottom Panel, and status bar;
- shared CommandService routing across Activity Bar, menus, Command Palette, shortcuts, Inspector, Search, and panel navigation;
- command palette with runtime availability reasons and keyboard navigation;
- responsive workbench layout built with Tailwind CSS v4, HeroUI 3, and Motion.

The terminal path is intentionally:

```text
xterm.js
   ↕
Tauri commands/events
   ↕
portable-pty
   ↕
system ssh
   ↕
remote server
```

This preserves real terminal semantics for shells and interactive programs such as `vim`, `top`, `sudo`, and remote TUIs.

## Run desktop locally

### Requirements

- Rust stable toolchain;
- Node.js 22+ and npm;
- system OpenSSH clients available as `ssh` and `sftp`;
- Tauri 2 system dependencies for your operating system.

### Windows 11 / PowerShell

Make sure these commands work first:

```powershell
rustc --version
cargo --version
node --version
npm --version
ssh -V
sftp -h
```

Then:

```powershell
git clone https://github.com/GendByteMaster/SSHDeck.git
cd SSHDeck
git switch main
cd desktop
npm install
npm run tauri dev
```

For an existing clone:

```powershell
cd SSHDeck
git switch main
git pull --ff-only origin main
cd desktop
npm install
npm run tauri dev
```

If Tauri cannot compile on Windows, install the Visual Studio C++ Build Tools/MSVC workload and ensure WebView2 is available, then run the same command again.

### Linux / macOS

After installing the normal Tauri 2 system dependencies for the OS:

```bash
git clone https://github.com/GendByteMaster/SSHDeck.git
cd SSHDeck
git switch main
cd desktop
npm install
npm run tauri dev
```

### Frontend-only development

This starts only the React/Vite UI. SSH/PTTY/Tauri commands will not work without the Tauri backend.

```bash
cd desktop
npm install
npm run dev
```

## Validation and release gates

Core Rust checks:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
```

Desktop UI contracts and frontend build:

```bash
cd desktop
npm install
npm run test:ui-contracts
npm run build
```

Tauri backend checks:

```bash
cd desktop/src-tauri
cargo test
cargo check
```

GitHub Actions runs the Rust and Linux desktop gates and also has a dedicated `windows-latest` desktop gate. The Windows gate runs the UI contracts, frontend build, Tauri tests/check, builds the real debug Tauri executable, launches `sshdeck-desktop.exe`, and fails if the process exits during the startup smoke window.

### Full Windows runtime smoke

The CI startup smoke proves that the Windows desktop application builds and remains alive at startup. It does not pretend to validate real SSH/SFTP workflows without a test server and credentials.

For the final functional Windows gate, update your checkout and run from the repository root:

```powershell
.\scripts\windows-runtime-smoke.ps1
```

The script runs the build gates, launches SSHDeck, and guides you through ten explicit checks covering Workbench navigation, SFTP diagnostics, Transfers, Ports/tunnel synchronization, session synchronization, layout restore behavior, and log redaction. Use a disposable/test SSH server for transfer or destructive checks. The script exits non-zero if any item is marked as failed.

After a successful build has already been produced, the interactive portion can be rerun without rebuilding:

```powershell
.\scripts\windows-runtime-smoke.ps1 -SkipBuild
```

## CLI

```bash
sshdeck list
sshdeck connect <host-alias>
sshdeck exec <host-alias> <command> [args...]
```

Run the CLI from source:

```bash
cargo run -- list
cargo run -- connect voxelyra
```

Release build:

```bash
cargo build --release
```

## OpenSSH example

```sshconfig
Host voxelyra
    HostName 203.0.113.10
    User deploy
    IdentityFile ~/.ssh/id_ed25519

Host submart
    HostName 203.0.113.11
    User root
    ProxyJump bastion
```

Imported entries keep their source alias for real connections, so OpenSSH still applies `ProxyJump`, `Match`, `Include`, certificates, agents, and host verification.

## Dangerous Command Protection

Quick Commands are classified locally before SSHDeck sends them to the active PTY.

Examples of elevated risk include:

- recursive forced deletion such as `rm -rf`;
- filesystem/disk operations such as `mkfs`, `wipefs`, or raw `dd` writes to `/dev/*`;
- destructive Git cleanup/reset operations;
- Docker volume/system pruning;
- destructive database statements;
- firewall resets;
- server shutdown/reboot;
- infrastructure destruction such as `terraform destroy`.

Under the Standard policy, low-risk Quick Commands execute normally while medium/high/critical commands require confirmation. Under the Strict policy, every Quick Command requires confirmation. Critical commands always require typing `RUN` before execution.

This protection applies to saved Quick Commands. SSHDeck intentionally does not intercept text manually typed into the terminal, because the terminal remains a real user-controlled shell.

## Repository layout

```text
SSHDeck/
├── src/                     # reusable Rust SSHDeck core + CLI
├── desktop/
│   ├── scripts/             # UI contract checks
│   ├── src/                 # React/xterm.js workbench UI
│   └── src-tauri/           # Tauri + portable-pty/OpenSSH bridge
├── scripts/                 # release/runtime smoke tooling
└── .github/workflows/ci.yml
```

## Design principles

- **OpenSSH-first** — reuse OpenSSH instead of reimplementing authentication and transport.
- **Real terminal semantics** — interactive sessions use a PTY, not plain pipes.
- **Local-first** — server definitions and workspace state stay on the user's machine.
- **Fast path** — connecting to a known server should take one UI action.
- **Developer-focused** — terminals, SFTP, transfers, Quick Commands, tunnels, connection health, logs, and workspace search are first-class features.
- **Secure by default** — SSHDeck does not copy private-key material into its own storage and does not bypass `known_hosts` verification.
- **Shared lifecycle ownership** — sessions, tunnels, transfers, logs, and settings each have one authoritative state/lifecycle path rather than per-view duplicates.
- **Workbench-first UI** — navigation and auxiliary tooling stay around a central terminal workspace rather than competing with it.

## Next milestones

1. Cross-platform desktop packaging, installers, and signed releases.
2. Optional session/history export and richer diagnostics export.
3. OpenSSH executable override only after all SSH/SFTP subprocess paths share one transport configuration.
4. Additional recovery/backup workflows for portable workspace state.

## Security

SSHDeck delegates authentication and host verification to OpenSSH. Private keys should remain managed by OpenSSH, the operating system, `ssh-agent`, or compatible hardware-backed agents.

Passwords used for password-authenticated sessions are kept only in application memory for the running process and are not written into the SSHDeck registry. Structured runtime logs intentionally exclude raw terminal/password-prompt output and apply centralized redaction to credential-like values and private-key material.

## License

MIT
