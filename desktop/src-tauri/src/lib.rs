use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use sshdeck::config::SshConfig;
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
fn terminal_start(host: String, app: AppHandle, sessions: State<'_, Sessions>) -> Result<String, String> {
    let config = SshConfig::load_default().map_err(|error| error.to_string())?;
    config.require_host(&host).map_err(|error| error.to_string())?;

    let pair = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|error| error.to_string())?;

    let mut command = CommandBuilder::new("ssh");
    command.arg(&host);
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
        .invoke_handler(tauri::generate_handler![list_hosts, terminal_start, terminal_write, terminal_resize, terminal_close])
        .run(tauri::generate_context!())
        .expect("error while running SSHDeck");
}
