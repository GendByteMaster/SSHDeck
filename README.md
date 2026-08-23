# SSHDeck

SSHDeck is a fast SSH workspace for developers. It keeps the familiar OpenSSH toolchain and adds a simpler workflow for discovering, connecting to, and working with servers.

## Current foundation

SSHDeck v0.1 uses the system OpenSSH client instead of implementing its own SSH protocol stack. This means existing `~/.ssh/config`, `ssh-agent`, `known_hosts`, `ProxyJump`, `IdentityFile`, certificates, and hardware-backed keys continue to work as expected.

### Commands

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

## Build

Requirements:

- Rust stable
- OpenSSH client available as `ssh`

```bash
git clone https://github.com/GendByteMaster/SSHDeck.git
cd SSHDeck
cargo build --release
```

Run locally:

```bash
cargo run -- list
cargo run -- connect voxelyra
```

## Design principles

- OpenSSH-first: reuse the proven SSH stack instead of reimplementing authentication and transport.
- Local-first: server definitions and connection state stay on the user's machine.
- Fast path: connecting to a known host should take one command or one UI action.
- Developer-focused: terminal sessions, quick commands, tunnels, Docker workflows, and project grouping belong in the product; unrelated infrastructure management does not.
- Secure by default: SSHDeck must not copy private keys into its own storage.

## Roadmap

The next product layer is a desktop application built around the same Rust core:

1. server workspace and favorites;
2. import and inspection of `~/.ssh/config`;
3. integrated terminal with multiple tabs;
4. reconnect and session history;
5. quick commands;
6. port-forwarding manager;
7. lightweight server status;
8. dangerous-command warnings;
9. Tauri desktop shell and polished UI.

The Rust core should remain usable from the CLI even after the desktop interface is added.

## Security

SSHDeck intentionally delegates authentication and host verification to OpenSSH. Private key material should remain managed by OpenSSH, the operating system, `ssh-agent`, or compatible hardware-backed agents.

## License

MIT
