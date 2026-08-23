use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use sshdeck::config::SshConfig;
use sshdeck::registry::{ServerRecord, ServerRegistry};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
struct Sessions(Mutex<HashMap<String, Session>>);

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
        let Some((key, value)) = line.split_once(' ') else { continue };
        match key {
            "hostname" if host.is_none() => host = Some(value.trim().to_owned()),
            "user" if user.is_none() => user = Some(value.trim().to_owned()),
            "port" => port = value.trim().parse().unwrap_or(22),
            "identityfile" if identity_file.is_none() => identity_file = Some(value.trim().to_owned()),
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
    let servers = ServerRegistry::load_default()
        .and_then(|registry| registry.list())
        .map_err(|error| error.to_string())?;
    servers
        .into_iter()
        .find(|server| server.id == id)
        .ok_or_else(|| "server not found".to_owned())
}

#[tauri::command]
fn terminal_start_server(server_id: String, app: AppHandle, sessions: State<'_, Sessions>) -> Result<String, String> {
    let server = find_server(&server_id)?;

    let pair = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|error| error.to_string())?;

    let mut command = CommandBuilder::new("ssh");
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

    let child = pair.slave.spawn_command(command).map_err(|error| error.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|error| error.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|error| error.to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let event_id = session_id.clone();

    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let _ = app.emit("terminal-output", TerminalOutput {
                        session_id: event_id.clone(),
                        data: buffer[..read].to_vec(),
                    });
                }
            }
        }
    });

    sessions.0.lock().map_err(|_| "session lock poisoned".to_owned())?
        .insert(session_id.clone(), Session { master: pair.master, writer, child });

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let _ = ServerRegistry::load_default().and_then(|registry| registry.touch_recent(&server_id, now));

    Ok(session_id)
}

#[tauri::command]
fn terminal_write(session_id: String, data: String, sessions: State<'_, Sessions>) -> Result<(), String> {
    let mut sessions = sessions.0.lock().map_err(|_| "session lock poisoned".to_owned())?;
    let session = sessions.get_mut(&session_id).ok_or_else(|| "unknown terminal session".to_owned())?;
    session.writer.write_all(data.as_bytes()).map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_resize(session_id: String, rows: u16, cols: u16, sessions: State<'_, Sessions>) -> Result<(), String> {
    let sessions = sessions.0.lock().map_err(|_| "session lock poisoned".to_owned())?;
    let session = sessions.get(&session_id).ok_or_else(|| "unknown terminal session".to_owned())?;
    session.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_close(session_id: String, sessions: State<'_, Sessions>) -> Result<(), String> {
    let mut sessions = sessions.0.lock().map_err(|_| "session lock poisoned".to_owned())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Sessions::default())
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            list_servers,
            save_server,
            delete_server,
            import_ssh_host,
            terminal_start_server,
            terminal_write,
            terminal_resize,
            terminal_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running SSHDeck");
}
