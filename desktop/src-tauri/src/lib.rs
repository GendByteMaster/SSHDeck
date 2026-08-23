use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child as ProcessChild, Command};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use sshdeck::config::SshConfig;
use sshdeck::registry::{ServerRecord, ServerRegistry};
use sshdeck::workspace::{QuickCommand, TunnelKind, TunnelRecord, WorkspaceData, WorkspaceStore};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
struct Sessions(Mutex<HashMap<String, Session>>);

#[derive(Default)]
struct Tunnels(Mutex<HashMap<String, ProcessChild>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: Vec<u8>,
}

#[tauri::command]
fn list_hosts() -> Result<Vec<String>, String> {
    let config = SshConfig::load_default().map_err(|error| error.to_string())?;
    Ok(config.hosts().map(str::to_owned).collect())
}

#[tauri::command]
fn list_servers() -> Result<Vec<ServerRecord>, String> {
    ServerRegistry::load_default()
        .and_then(|registry| registry.list())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_server(mut server: ServerRecord) -> Result<ServerRecord, String> {
    if server.id.trim().is_empty() {
        server.id = Uuid::new_v4().to_string();
    }
    server.name = server.name.trim().to_owned();
    server.host = server.host.trim().to_owned();
    if server.name.is_empty() || server.host.is_empty() {
        return Err("server name and host are required".to_owned());
    }
    if server.port == 0 {
        return Err("port must be greater than zero".to_owned());
    }
    ServerRegistry::load_default()
        .and_then(|registry| registry.upsert(server.clone()))
        .map_err(|error| error.to_string())?;
    Ok(server)
}

#[tauri::command]
fn delete_server(id: String) -> Result<(), String> {
    ServerRegistry::load_default()
        .and_then(|registry| registry.delete(&id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_ssh_host(alias: String) -> Result<ServerRecord, String> {
    let config = SshConfig::load_default().map_err(|error| error.to_string())?;
    config.require_host(&alias).map_err(|error| error.to_string())?;
    let output = Command::new("ssh")
        .args(["-G", &alias])
        .output()
        .map_err(|error| format!("failed to run ssh -G: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }

    let resolved = String::from_utf8_lossy(&output.stdout);
    let mut host = None;
    let mut user = None;
    let mut port = 22_u16;
    let mut identity_file = None;
    for line in resolved.lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        match key {
            "hostname" if host.is_none() => host = Some(value.trim().to_owned()),
            "user" if user.is_none() => user = Some(value.trim().to_owned()),
            "port" => port = value.trim().parse().unwrap_or(22),
            "identityfile" if identity_file.is_none() => {
                identity_file = Some(value.trim().to_owned())
            }
            _ => {}
        }
    }

    let server = ServerRecord {
        id: Uuid::new_v4().to_string(),
        name: alias.clone(),
        host: host.unwrap_or(alias.clone()),
        user,
        port,
        identity_file,
        group: None,
        favorite: false,
        source_alias: Some(alias),
        last_connected_at: None,
    };
    ServerRegistry::load_default()
        .and_then(|registry| registry.upsert(server.clone()))
        .map_err(|error| error.to_string())?;
    Ok(server)
}

fn find_server(id: &str) -> Result<ServerRecord, String> {
    ServerRegistry::load_default()
        .and_then(|registry| registry.list())
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|server| server.id == id)
        .ok_or_else(|| "server not found".to_owned())
}

fn ssh_command_for(server: &ServerRecord) -> CommandBuilder {
    let mut command = CommandBuilder::new("ssh");
    if let Some(alias) = &server.source_alias {
        command.arg(alias);
        return command;
    }
    command.arg("-p");
    command.arg(server.port.to_string());
    if let Some(identity_file) = &server.identity_file {
        command.arg("-i");
        command.arg(identity_file);
    }
    let target = match &server.user {
        Some(user) if !user.is_empty() => format!("{user}@{}", server.host),
        _ => server.host.clone(),
    };
    command.arg(target);
    command
}

fn append_process_ssh_target(command: &mut Command, server: &ServerRecord) {
    if let Some(alias) = &server.source_alias {
        command.arg(alias);
        return;
    }
    command.arg("-p").arg(server.port.to_string());
    if let Some(identity_file) = &server.identity_file {
        command.arg("-i").arg(identity_file);
    }
    let target = match &server.user {
        Some(user) if !user.is_empty() => format!("{user}@{}", server.host),
        _ => server.host.clone(),
    };
    command.arg(target);
}

#[tauri::command]
fn terminal_start_server(
    server_id: String,
    app: AppHandle,
    sessions: State<'_, Sessions>,
) -> Result<String, String> {
    let server = find_server(&server_id)?;
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let child = pair
        .slave
        .spawn_command(ssh_command_for(&server))
        .map_err(|error| error.to_string())?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let event_id = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: event_id.clone(),
                            data: buffer[..read].to_vec(),
                        },
                    );
                }
            }
        }
    });
    sessions
        .0
        .lock()
        .map_err(|_| "session lock poisoned".to_owned())?
        .insert(
            session_id.clone(),
            Session {
                master: pair.master,
                writer,
                child,
            },
        );

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let _ = ServerRegistry::load_default().and_then(|registry| registry.touch_recent(&server_id, now));
    Ok(session_id)
}

#[tauri::command]
fn terminal_write(
    session_id: String,
    data: String,
    sessions: State<'_, Sessions>,
) -> Result<(), String> {
    let mut sessions = sessions
        .0
        .lock()
        .map_err(|_| "session lock poisoned".to_owned())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "unknown terminal session".to_owned())?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_resize(
    session_id: String,
    rows: u16,
    cols: u16,
    sessions: State<'_, Sessions>,
) -> Result<(), String> {
    let sessions = sessions
        .0
        .lock()
        .map_err(|_| "session lock poisoned".to_owned())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "unknown terminal session".to_owned())?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_close(session_id: String, sessions: State<'_, Sessions>) -> Result<(), String> {
    let mut sessions = sessions
        .0
        .lock()
        .map_err(|_| "session lock poisoned".to_owned())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
    }
    Ok(())
}

#[tauri::command]
fn workspace_load() -> Result<WorkspaceData, String> {
    WorkspaceStore::load_default()
        .and_then(|store| store.load())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_quick_command(mut item: QuickCommand) -> Result<WorkspaceData, String> {
    if item.id.trim().is_empty() {
        item.id = Uuid::new_v4().to_string();
    }
    item.name = item.name.trim().to_owned();
    item.command = item.command.trim().to_owned();
    if item.name.is_empty() || item.command.is_empty() {
        return Err("quick command name and command are required".to_owned());
    }
    let store = WorkspaceStore::load_default().map_err(|error| error.to_string())?;
    let mut data = store.load().map_err(|error| error.to_string())?;
    if let Some(existing) = data.quick_commands.iter_mut().find(|value| value.id == item.id) {
        *existing = item;
    } else {
        data.quick_commands.push(item);
    }
    store.save(&data).map_err(|error| error.to_string())?;
    Ok(data)
}

#[tauri::command]
fn delete_quick_command(id: String) -> Result<WorkspaceData, String> {
    let store = WorkspaceStore::load_default().map_err(|error| error.to_string())?;
    let mut data = store.load().map_err(|error| error.to_string())?;
    data.quick_commands.retain(|value| value.id != id);
    store.save(&data).map_err(|error| error.to_string())?;
    Ok(data)
}

#[tauri::command]
fn run_quick_command(
    session_id: String,
    command_id: String,
    sessions: State<'_, Sessions>,
) -> Result<(), String> {
    let data = WorkspaceStore::load_default()
        .and_then(|store| store.load())
        .map_err(|error| error.to_string())?;
    let item = data
        .quick_commands
        .into_iter()
        .find(|value| value.id == command_id)
        .ok_or_else(|| "quick command not found".to_owned())?;
    terminal_write(session_id, format!("{}\n", item.command), sessions)
}

fn validate_tunnel(tunnel: &TunnelRecord) -> Result<(), String> {
    if tunnel.name.trim().is_empty() {
        return Err("tunnel name is required".to_owned());
    }
    if tunnel.local_port == 0 {
        return Err("listen port must be greater than zero".to_owned());
    }
    if !matches!(tunnel.kind, TunnelKind::Dynamic)
        && (tunnel.remote_host.as_deref().unwrap_or("").trim().is_empty()
            || tunnel.remote_port.unwrap_or(0) == 0)
    {
        return Err("remote host and port are required for local/remote forwarding".to_owned());
    }
    Ok(())
}

#[tauri::command]
fn save_tunnel(mut tunnel: TunnelRecord) -> Result<WorkspaceData, String> {
    if tunnel.id.trim().is_empty() {
        tunnel.id = Uuid::new_v4().to_string();
    }
    validate_tunnel(&tunnel)?;
    find_server(&tunnel.server_id)?;
    let store = WorkspaceStore::load_default().map_err(|error| error.to_string())?;
    let mut data = store.load().map_err(|error| error.to_string())?;
    if let Some(existing) = data.tunnels.iter_mut().find(|value| value.id == tunnel.id) {
        *existing = tunnel;
    } else {
        data.tunnels.push(tunnel);
    }
    store.save(&data).map_err(|error| error.to_string())?;
    Ok(data)
}

#[tauri::command]
fn delete_tunnel(id: String, tunnels: State<'_, Tunnels>) -> Result<WorkspaceData, String> {
    if let Some(mut child) = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?
        .remove(&id)
    {
        let _ = child.kill();
    }
    let store = WorkspaceStore::load_default().map_err(|error| error.to_string())?;
    let mut data = store.load().map_err(|error| error.to_string())?;
    data.tunnels.retain(|value| value.id != id);
    store.save(&data).map_err(|error| error.to_string())?;
    Ok(data)
}

#[tauri::command]
fn start_tunnel(id: String, tunnels: State<'_, Tunnels>) -> Result<Vec<String>, String> {
    let data = WorkspaceStore::load_default()
        .and_then(|store| store.load())
        .map_err(|error| error.to_string())?;
    let tunnel = data
        .tunnels
        .into_iter()
        .find(|value| value.id == id)
        .ok_or_else(|| "tunnel not found".to_owned())?;
    validate_tunnel(&tunnel)?;
    let server = find_server(&tunnel.server_id)?;

    let bind = tunnel.bind_host.as_deref().unwrap_or("127.0.0.1");
    let forward = match tunnel.kind {
        TunnelKind::Local => format!(
            "{bind}:{}:{}:{}",
            tunnel.local_port,
            tunnel.remote_host.as_deref().unwrap_or("127.0.0.1"),
            tunnel.remote_port.unwrap_or(0)
        ),
        TunnelKind::Remote => format!(
            "{bind}:{}:{}:{}",
            tunnel.local_port,
            tunnel.remote_host.as_deref().unwrap_or("127.0.0.1"),
            tunnel.remote_port.unwrap_or(0)
        ),
        TunnelKind::Dynamic => format!("{bind}:{}", tunnel.local_port),
    };

    let mut command = Command::new("ssh");
    command
        .arg("-N")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg(match tunnel.kind {
            TunnelKind::Local => "-L",
            TunnelKind::Remote => "-R",
            TunnelKind::Dynamic => "-D",
        })
        .arg(forward);
    append_process_ssh_target(&mut command, &server);
    let child = command
        .spawn()
        .map_err(|error| format!("failed to start tunnel: {error}"))?;
    tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?
        .insert(id, child);
    active_tunnels(tunnels)
}

#[tauri::command]
fn stop_tunnel(id: String, tunnels: State<'_, Tunnels>) -> Result<Vec<String>, String> {
    if let Some(mut child) = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?
        .remove(&id)
    {
        child.kill().map_err(|error| error.to_string())?;
    }
    active_tunnels(tunnels)
}

#[tauri::command]
fn active_tunnels(tunnels: State<'_, Tunnels>) -> Result<Vec<String>, String> {
    let mut values = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?;
    values.retain(|_, child| match child.try_wait() {
        Ok(None) => true,
        Ok(Some(_)) | Err(_) => false,
    });
    Ok(values.keys().cloned().collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Sessions::default())
        .manage(Tunnels::default())
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            list_servers,
            save_server,
            delete_server,
            import_ssh_host,
            terminal_start_server,
            terminal_write,
            terminal_resize,
            terminal_close,
            workspace_load,
            save_quick_command,
            delete_quick_command,
            run_quick_command,
            save_tunnel,
            delete_tunnel,
            start_tunnel,
            stop_tunnel,
            active_tunnels
        ])
        .run(tauri::generate_context!())
        .expect("error while running SSHDeck");
}
