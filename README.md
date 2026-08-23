# SSHDeck

SSHDeck is a fast SSH workspace for developers. It keeps the familiar OpenSSH toolchain and adds a simpler workflow for discovering, connecting to, and working with servers.

## What works now

SSHDeck has two layers:

- a Rust CLI/core that uses the system OpenSSH client;
- a Tauri 2 desktop workspace with React, TypeScript, xterm.js, and a real PTY-backed SSH terminal.

Existing `~/.ssh/config`, `ssh-agent`, `known_hosts`, `ProxyJump`, `IdentityFile`, certificates, and hardware-backed keys remain owned by OpenSSH instead of being copied into SSHDeck.

### CLI

```bash
sshdeck list
sshdeck connect <host-alias>
sshdeck exec <host-alias> <command> [args...]
```

Example `~/.ssh/config`:

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

Then:

```bash
sshdeck list
sshdeck connect voxelyra
sshdeck exec voxelyra uname -a
```

## Desktop workspace

The desktop app currently provides:

- automatic host discovery from `~/.ssh/config`;
- searchable server sidebar;
- one-click SSH connection;
- multiple SSH terminal tabs;
- interactive PTY sessions suitable for shells and terminal applications;
- terminal resize propagation;
- session close handling;
- system OpenSSH authentication and host verification.

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

This avoids treating SSH like a normal stdout-only child process, which would break interactive programs such as `vim`, `top`, `sudo`, and other TUI applications.

## Run CLI locally

Requirements:

- Rust stable
- OpenSSH client available as `ssh`

```bash
git clone https://github.com/GendByteMaster/SSHDeck.git
cd SSHDeck
git checkout dev/master
cargo run -- list
cargo run -- connect voxelyra
```

Release build:

```bash
cargo build --release
```

## Run desktop locally

Requirements:

- Rust stable
- Node.js 22+
- npm
- Tauri 2 system dependencies for your OS
- OpenSSH client available as `ssh`

```bash
git clone https://github.com/GendByteMaster/SSHDeck.git
cd SSHDeck
git checkout dev/master
cd desktop
npm install
npm run tauri dev
```

Frontend-only development:

```bash
cd desktop
npm install
npm run dev
```

Build the frontend:

```bash
cd desktop
npm run build
```

## Repository layout

```text
SSHDeck/
├── src/                     # reusable Rust SSHDeck core + CLI
│   ├── lib.rs
│   ├── main.rs
│   ├── config.rs
│   ├── server.rs
│   └── ssh.rs
├── desktop/
│   ├── src/                 # React/xterm.js UI
│   └── src-tauri/           # Tauri + portable-pty bridge
└── .github/workflows/ci.yml
```

## Design principles

- **OpenSSH-first** — reuse the proven SSH stack instead of reimplementing authentication and transport.
- **Real terminal semantics** — interactive sessions run through a PTY, not plain pipes.
- **Local-first** — server definitions and connection state stay on the user's machine.
- **Fast path** — connecting to a known host should take one command or one UI action.
- **Developer-focused** — terminal sessions, quick commands, tunnels, Docker workflows, and project grouping belong in the product; unrelated infrastructure management does not.
- **Secure by default** — SSHDeck must not copy private keys into its own storage.

## Next milestones

1. Add/Edit Server UI with safe writes to SSH config or an SSHDeck-local overlay.
2. Favorites, groups, and recent servers.
3. Connection/reconnect state and session history.
4. Quick commands.
5. Port-forwarding manager.
6. Lightweight server status.
7. Dangerous-command warnings.
8. Desktop packaging for Windows, Linux, and macOS.

The Rust core remains usable independently from the desktop interface.

## Security

SSHDeck intentionally delegates authentication and host verification to OpenSSH. Private key material should remain managed by OpenSSH, the operating system, `ssh-agent`, or compatible hardware-backed agents.

## License

MIT
