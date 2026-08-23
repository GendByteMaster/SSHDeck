# SSHDeck

SSHDeck is a fast, local-first SSH workspace for developers. It keeps the proven OpenSSH toolchain and adds a focused desktop workflow for discovering servers, opening real terminal sessions, running shortcuts, managing tunnels, and understanding connection state.

## What works now

SSHDeck has two layers:

- a reusable Rust CLI/core that uses the system OpenSSH client;
- a Tauri 2 desktop workspace with React, TypeScript, xterm.js, and real PTY-backed SSH sessions.

Existing `~/.ssh/config`, `ssh-agent`, `known_hosts`, `ProxyJump`, `IdentityFile`, certificates, and hardware-backed keys remain owned by OpenSSH instead of being copied into SSHDeck.

### Desktop features

- Add/Edit/Delete servers in an SSHDeck-local registry;
- import literal hosts from `~/.ssh/config` through `ssh -G`;
- safe OpenSSH snippet export without rewriting `~/.ssh/config`;
- Favorites, Groups, Recent, and server search;
- multiple PTY-backed SSH terminal tabs;
- real session lifecycle: active, reconnecting, disconnected, failed;
- duration, exit code, signal, bounded connection history, manual reconnect, and optional auto-reconnect;
- authenticated SSH server probes with online/auth-required/offline/error states, latency, and Linux uptime when available;
- Quick Commands scoped globally or to a server;
- local (`-L`), remote (`-R`), and dynamic SOCKS (`-D`) forwarding;
- tunnel runtime health, stderr diagnostics, keepalives, and bounded auto-restart;
- Dangerous Command Protection for Quick Commands with risk classification and explicit confirmation.

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
- system OpenSSH client available as `ssh`;
- Tauri 2 system dependencies for your operating system.

### Windows 11 / PowerShell

Make sure these commands work first:

```powershell
rustc --version
cargo --version
node --version
npm --version
ssh -V
```

Then:

```powershell
git clone https://github.com/GendByteMaster/SSHDeck.git
cd SSHDeck
git checkout dev/master
cd desktop
npm install
npm run tauri dev
```

For an existing clone:

```powershell
cd SSHDeck
git switch dev/master
git pull
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
git checkout dev/master
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

### Build checks

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all

cd desktop
npm install
npm run build
cd src-tauri
cargo check
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

Low-risk commands execute normally. Medium/high/critical commands show a confirmation dialog with the detected reasons. Critical commands additionally require typing `RUN` before execution.

This protection applies to saved Quick Commands. SSHDeck intentionally does not intercept text manually typed into the terminal, because the terminal remains a real user-controlled shell.

## Repository layout

```text
SSHDeck/
├── src/                     # reusable Rust SSHDeck core + CLI
├── desktop/
│   ├── src/                 # React/xterm.js UI
│   └── src-tauri/           # Tauri + portable-pty/OpenSSH bridge
└── .github/workflows/ci.yml
```

## Design principles

- **OpenSSH-first** — reuse OpenSSH instead of reimplementing authentication and transport.
- **Real terminal semantics** — interactive sessions use a PTY, not plain pipes.
- **Local-first** — server definitions and workspace state stay on the user's machine.
- **Fast path** — connecting to a known server should take one UI action.
- **Developer-focused** — terminals, Quick Commands, tunnels, connection health, and project grouping are first-class features.
- **Secure by default** — SSHDeck does not copy private-key material into its own storage and does not bypass `known_hosts` verification.

## Next milestones

1. Richer command safety policies and audit history.
2. Tunnel/session history export and diagnostics.
3. Keyboard shortcuts and command palette.
4. SFTP/file browser as an optional workspace panel.
5. Cross-platform desktop packaging and signed releases.

## Security

SSHDeck delegates authentication and host verification to OpenSSH. Private keys should remain managed by OpenSSH, the operating system, `ssh-agent`, or compatible hardware-backed agents.

## License

MIT
