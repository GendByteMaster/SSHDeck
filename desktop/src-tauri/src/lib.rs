mod status;

use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child as ProcessChild, Command, Stdio};
use std::sync::{Arc, Mutex};
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
    server_id: String,
    started_at_ms: u64,
    ended_at_ms: Option<u64>,
    exit_code: Option<u32>,
    signal: Option<String>,
}

#[derive(Default)]
struct Sessions(Mutex<HashMap<String, Session>>);

struct TunnelRuntime {
    child: ProcessChild,
    started_at_ms: u64,
    ended_at_ms: Option<u64>,
    exit_code: Option<i32>,
    stderr: Arc<Mutex<String>>,
    stopped_by_user: bool,
}

#[derive(Default)]
struct Tunnels(Mutex<HashMap<String, TunnelRuntime>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalSessionStatus {
    session_id: String,
    server_id: String,
    state: String,
    started_at_ms: u64,
    ended_at_ms: Option<u64>,
    duration_ms: u64,
    exit_code: Option<u32>,
    signal: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TunnelProcessStatus {
    tunnel_id: String,
    state: String,
    started_at_ms: u64,
    ended_at_ms: Option<u64>,
    duration_ms: u64,
    exit_code: Option<i32>,
    reason: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default()
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
fn server_status(server_id: String) -> Result<status::ServerStatus, String> {
    let server = find_server(&server_id)?;
    Ok(status::probe(&server))
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
                server_id: server_id.clone(),
                started_at_ms: now_ms(),
                ended_at_ms: None,
                exit_code: None,
                signal: None,
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
fn terminal_session_status(
    session_id: String,
    sessions: State<'_, Sessions>,
) -> Result<TerminalSessionStatus, String> {
    let mut sessions = sessions
        .0
        .lock()
        .map_err(|_| "session lock poisoned".to_owned())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "unknown terminal session".to_owned())?;

    if session.ended_at_ms.is_none() {
        match session.child.try_wait() {
            Ok(Some(exit)) => {
                session.ended_at_ms = Some(now_ms());
                session.exit_code = Some(exit.exit_code());
                session.signal = exit.signal().map(str::to_owned);
            }
            Ok(None) => {}
            Err(error) => return Err(format!("failed to read terminal process state: {error}")),
        }
    }

    let current = now_ms();
    let end = session.ended_at_ms.unwrap_or(current);
    let state = match session.ended_at_ms {
        None => "running",
        Some(_) if session.exit_code == Some(0) && session.signal.is_none() => "disconnected",
        Some(_) => "failed",
    };

    Ok(TerminalSessionStatus {
        session_id,
        server_id: session.server_id.clone(),
        state: state.to_owned(),
        started_at_ms: session.started_at_ms,
        ended_at_ms: session.ended_at_ms,
        duration_ms: end.saturating_sub(session.started_at_ms),
        exit_code: session.exit_code,
        signal: session.signal.clone(),
    })
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

fn tunnel_status_from_runtime(id: &str, runtime: &mut TunnelRuntime) -> Result<TunnelProcessStatus, String> {
    if runtime.ended_at_ms.is_none() {
        match runtime.child.try_wait() {
            Ok(Some(exit)) => {
                runtime.ended_at_ms = Some(now_ms());
                runtime.exit_code = exit.code();
            }
            Ok(None) => {}
            Err(error) => return Err(format!("failed to read tunnel process state: {error}")),
        }
    }

    let current = now_ms();
    let end = runtime.ended_at_ms.unwrap_or(current);
    let state = match runtime.ended_at_ms {
        None if runtime.stopped_by_user => "stopping",
        None => "running",
        Some(_) if runtime.stopped_by_user => "stopped",
        Some(_) => "failed",
    };
    let reason = if state == "failed" {
        runtime
            .stderr
            .lock()
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(1200).collect())
            .or_else(|| runtime.exit_code.map(|code| format!("ssh tunnel exited with code {code}")))
    } else {
        None
    };

    Ok(TunnelProcessStatus {
        tunnel_id: id.to_owned(),
        state: state.to_owned(),
        started_at_ms: runtime.started_at_ms,
        ended_at_ms: runtime.ended_at_ms,
        duration_ms: end.saturating_sub(runtime.started_at_ms),
        exit_code: runtime.exit_code,
        reason,
    })
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
    if let Some(mut runtime) = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?
        .remove(&id)
    {
        let _ = runtime.child.kill();
    }
    let store = WorkspaceStore::load_default().map_err(|error| error.to_string())?;
    let mut data = store.load().map_err(|error| error.to_string())?;
    data.tunnels.retain(|value| value.id != id);
    store.save(&data).map_err(|error| error.to_string())?;
    Ok(data)
}

#[tauri::command]
fn start_tunnel(id: String, tunnels: State<'_, Tunnels>) -> Result<TunnelProcessStatus, String> {
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
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=8")
        .arg("-o")
        .arg("ServerAliveInterval=15")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg(match tunnel.kind {
            TunnelKind::Local => "-L",
            TunnelKind::Remote => "-R",
            TunnelKind::Dynamic => "-D",
        })
        .arg(forward)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    append_process_ssh_target(&mut command, &server);
    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start tunnel: {error}"))?;

    let stderr_text = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = child.stderr.take() {
        let capture = Arc::clone(&stderr_text);
        std::thread::spawn(move || {
            let mut value = String::new();
            let _ = stderr.read_to_string(&mut value);
            if let Ok(mut target) = capture.lock() {
                *target = value;
            }
        });
    }

    let runtime = TunnelRuntime {
        child,
        started_at_ms: now_ms(),
        ended_at_ms: None,
        exit_code: None,
        stderr: stderr_text,
        stopped_by_user: false,
    };
    let mut values = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?;
    if let Some(mut previous) = values.remove(&id) {
        let _ = previous.child.kill();
    }
    values.insert(id.clone(), runtime);
    let runtime = values
        .get_mut(&id)
        .ok_or_else(|| "tunnel process disappeared after start".to_owned())?;
    tunnel_status_from_runtime(&id, runtime)
}

#[tauri::command]
fn stop_tunnel(id: String, tunnels: State<'_, Tunnels>) -> Result<TunnelProcessStatus, String> {
    let mut values = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?;
    let runtime = values
        .get_mut(&id)
        .ok_or_else(|| "tunnel is not running".to_owned())?;
    runtime.stopped_by_user = true;
    if runtime.ended_at_ms.is_none() {
        runtime.child.kill().map_err(|error| error.to_string())?;
    }
    tunnel_status_from_runtime(&id, runtime)
}

#[tauri::command]
fn tunnel_status(id: String, tunnels: State<'_, Tunnels>) -> Result<Option<TunnelProcessStatus>, String> {
    let mut values = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?;
    let Some(runtime) = values.get_mut(&id) else {
        return Ok(None);
    };
    tunnel_status_from_runtime(&id, runtime).map(Some)
}

#[tauri::command]
fn active_tunnels(tunnels: State<'_, Tunnels>) -> Result<Vec<String>, String> {
    let mut values = tunnels
        .0
        .lock()
        .map_err(|_| "tunnel lock poisoned".to_owned())?;
    let mut running = Vec::new();
    for (id, runtime) in values.iter_mut() {
        if tunnel_status_from_runtime(id, runtime)?.state == "running" {
            running.push(id.clone());
        }
    }
    Ok(running)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Sessions::default())
        .manage(Tunnels::default())
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            list_servers,
            server_status,
            save_server,
            delete_server,
            import_ssh_host,
            terminal_start_server,
            terminal_session_status,
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
            tunnel_status,
            active_tunnels
        ])
        .run(tauri::generate_context!())
        .expect("error while running SSHDeck");
}
