use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sshdeck::registry::ServerRecord;
use tauri::State;
use uuid::Uuid;

const MAX_CONCURRENT_TRANSFERS: usize = 2;
const UPLOAD_PROGRESS_PROBE_MS: u64 = 1_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TransferSnapshot {
    id: String,
    server_id: String,
    name: String,
    direction: String,
    state: String,
    local_path: String,
    remote_path: String,
    bytes_total: u64,
    bytes_transferred: u64,
    created_at_ms: u64,
    started_at_ms: Option<u64>,
    ended_at_ms: Option<u64>,
    error: Option<String>,
}

struct TransferRuntime {
    snapshot: Mutex<TransferSnapshot>,
    cancel: AtomicBool,
}

#[derive(Clone, Default)]
pub(super) struct TransferManager {
    transfers: Arc<Mutex<HashMap<String, Arc<TransferRuntime>>>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn validate_path(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{label} is required"));
    }
    if value.contains(['\n', '\r', '\0']) {
        return Err(format!("{label} contains unsupported control characters"));
    }
    Ok(())
}

fn quote_arg(value: &str) -> Result<String, String> {
    validate_path(value, "path")?;
    Ok(format!(
        "\"{}\"",
        value.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

fn join_remote(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else if parent == "." {
        format!("./{name}")
    } else {
        format!("{}/{}", parent.trim_end_matches('/'), name)
    }
}

fn append_target(command: &mut Command, server: &ServerRecord) {
    command
        .arg("-q")
        .arg("-b")
        .arg("-")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=12");

    if let Some(alias) = &server.source_alias {
        command.arg(alias);
        return;
    }

    command.arg("-P").arg(server.port.to_string());
    if let Some(identity_file) = &server.identity_file {
        command.arg("-i").arg(identity_file);
    }
    let target = match &server.user {
        Some(user) if !user.is_empty() => format!("{user}@{}", server.host),
        _ => server.host.clone(),
    };
    command.arg(target);
}

fn spawn_batch(server: &ServerRecord, script: &str) -> Result<Child, String> {
    let mut command = Command::new("sftp");
    append_target(&mut command, server);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start OpenSSH sftp: {error}"))?;

    child
        .stdin
        .as_mut()
        .ok_or_else(|| "sftp stdin is unavailable".to_owned())?
        .write_all(script.as_bytes())
        .map_err(|error| format!("failed to send sftp batch: {error}"))?;
    drop(child.stdin.take());
    Ok(child)
}

fn run_small_batch(server: &ServerRecord, script: &str) -> Result<String, String> {
    let mut command = Command::new("sftp");
    append_target(&mut command, server);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start OpenSSH sftp: {error}"))?;

    child
        .stdin
        .as_mut()
        .ok_or_else(|| "sftp stdin is unavailable".to_owned())?
        .write_all(script.as_bytes())
        .map_err(|error| format!("failed to send sftp batch: {error}"))?;
    drop(child.stdin.take());

    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to wait for sftp: {error}"))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    Err(if detail.is_empty() {
        "OpenSSH sftp command failed".to_owned()
    } else {
        format!("OpenSSH sftp command failed: {detail}")
    })
}

fn remote_file_size(server: &ServerRecord, remote_path: &str) -> Result<u64, String> {
    let output = run_small_batch(server, &format!("ls -ln {}\n", quote_arg(remote_path)?))?;
    for raw in output.lines() {
        let line = raw.trim();
        let columns: Vec<&str> = line.split_whitespace().collect();
        if columns.len() < 9 {
            continue;
        }
        let first = columns[0].as_bytes().first().copied().unwrap_or_default();
        if !matches!(first, b'-' | b'l') {
            continue;
        }
        return columns[4]
            .parse::<u64>()
            .map_err(|error| format!("could not parse remote file size: {error}"));
    }
    Err("remote file size is unavailable".to_owned())
}

fn snapshot(runtime: &TransferRuntime) -> Result<TransferSnapshot, String> {
    runtime
        .snapshot
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "transfer snapshot lock poisoned".to_owned())
}

fn update_snapshot(
    runtime: &TransferRuntime,
    update: impl FnOnce(&mut TransferSnapshot),
) -> Result<(), String> {
    let mut value = runtime
        .snapshot
        .lock()
        .map_err(|_| "transfer snapshot lock poisoned".to_owned())?;
    update(&mut value);
    Ok(())
}

fn mark_cancelled(runtime: &TransferRuntime) {
    let _ = update_snapshot(runtime, |value| {
        value.state = "cancelled".to_owned();
        value.ended_at_ms = Some(now_ms());
        value.error = None;
    });
}

fn claim_slot(manager: &TransferManager, runtime: &TransferRuntime) -> Result<bool, String> {
    let values = manager
        .transfers
        .lock()
        .map_err(|_| "transfer registry lock poisoned".to_owned())?;
    let mut running = 0usize;
    for value in values.values() {
        if snapshot(value)?.state == "running" {
            running += 1;
        }
    }
    if running >= MAX_CONCURRENT_TRANSFERS {
        return Ok(false);
    }
    update_snapshot(runtime, |value| {
        value.state = "running".to_owned();
        value.started_at_ms = Some(now_ms());
    })?;
    Ok(true)
}

fn update_progress(server: &ServerRecord, runtime: &TransferRuntime, last_probe_ms: &mut u64) {
    let Ok(current) = snapshot(runtime) else {
        return;
    };
    if current.state != "running" {
        return;
    }

    let bytes = if current.direction == "download" {
        fs::metadata(&current.local_path).map(|value| value.len()).ok()
    } else {
        let now = now_ms();
        if now.saturating_sub(*last_probe_ms) < UPLOAD_PROGRESS_PROBE_MS {
            return;
        }
        *last_probe_ms = now;
        remote_file_size(server, &current.remote_path).ok()
    };

    if let Some(bytes) = bytes {
        let _ = update_snapshot(runtime, |value| {
            value.bytes_transferred = if value.bytes_total > 0 {
                bytes.min(value.bytes_total)
            } else {
                bytes
            };
        });
    }
}

fn read_stderr(stderr: Option<std::process::ChildStderr>) -> String {
    let Some(mut stderr) = stderr else {
        return String::new();
    };
    let mut detail = String::new();
    let _ = stderr.read_to_string(&mut detail);
    detail.trim().to_owned()
}

fn run_transfer(
    manager: TransferManager,
    server: ServerRecord,
    runtime: Arc<TransferRuntime>,
) -> Result<(), String> {
    loop {
        if runtime.cancel.load(Ordering::Relaxed) {
            mark_cancelled(&runtime);
            return Ok(());
        }
        if claim_slot(&manager, &runtime)? {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }

    let current = snapshot(&runtime)?;
    let script = if current.direction == "upload" {
        format!(
            "put {} {}\n",
            quote_arg(&current.local_path)?,
            quote_arg(&current.remote_path)?
        )
    } else {
        format!(
            "get {} {}\n",
            quote_arg(&current.remote_path)?,
            quote_arg(&current.local_path)?
        )
    };

    let mut child = match spawn_batch(&server, &script) {
        Ok(child) => child,
        Err(error) => {
            update_snapshot(&runtime, |value| {
                value.state = "failed".to_owned();
                value.error = Some(error.clone());
                value.ended_at_ms = Some(now_ms());
            })?;
            return Ok(());
        }
    };
    let mut stderr = child.stderr.take();
    let mut last_probe_ms = 0u64;

    loop {
        if runtime.cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            mark_cancelled(&runtime);
            return Ok(());
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let detail = read_stderr(stderr.take());
                if status.success() {
                    update_snapshot(&runtime, |value| {
                        value.state = "done".to_owned();
                        if value.bytes_total > 0 {
                            value.bytes_transferred = value.bytes_total;
                        }
                        value.error = None;
                        value.ended_at_ms = Some(now_ms());
                    })?;
                } else {
                    update_snapshot(&runtime, |value| {
                        value.state = "failed".to_owned();
                        value.error = Some(if detail.is_empty() {
                            "OpenSSH sftp transfer failed".to_owned()
                        } else if detail.to_ascii_lowercase().contains("permission denied") {
                            format!(
                                "SFTP authentication failed. Non-interactive OpenSSH authentication is required. {detail}"
                            )
                        } else {
                            format!("OpenSSH sftp transfer failed: {detail}")
                        });
                        value.ended_at_ms = Some(now_ms());
                    })?;
                }
                return Ok(());
            }
            Ok(None) => update_progress(&server, &runtime, &mut last_probe_ms),
            Err(error) => {
                let _ = child.kill();
                update_snapshot(&runtime, |value| {
                    value.state = "failed".to_owned();
                    value.error = Some(format!("failed to poll sftp transfer: {error}"));
                    value.ended_at_ms = Some(now_ms());
                })?;
                return Ok(());
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
}

fn spawn_worker(manager: TransferManager, server: ServerRecord, runtime: Arc<TransferRuntime>) {
    thread::spawn(move || {
        if let Err(error) = run_transfer(manager, server, runtime.clone()) {
            let _ = update_snapshot(&runtime, |value| {
                if value.state != "cancelled" {
                    value.state = "failed".to_owned();
                    value.error = Some(error);
                    value.ended_at_ms = Some(now_ms());
                }
            });
        }
    });
}

fn enqueue(
    manager: TransferManager,
    server: ServerRecord,
    direction: &str,
    local_path: String,
    remote_path: String,
    bytes_total: u64,
) -> Result<TransferSnapshot, String> {
    let name = if direction == "upload" {
        Path::new(&local_path)
            .file_name()
            .and_then(|value| value.to_str())
            .map(str::to_owned)
            .ok_or_else(|| "could not determine local file name".to_owned())?
    } else {
        remote_path
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .filter(|value| !value.is_empty())
            .unwrap_or(&remote_path)
            .to_owned()
    };
    let value = TransferSnapshot {
        id: Uuid::new_v4().to_string(),
        server_id: server.id.clone(),
        name,
        direction: direction.to_owned(),
        state: "queued".to_owned(),
        local_path,
        remote_path,
        bytes_total,
        bytes_transferred: 0,
        created_at_ms: now_ms(),
        started_at_ms: None,
        ended_at_ms: None,
        error: None,
    };
    let runtime = Arc::new(TransferRuntime {
        snapshot: Mutex::new(value.clone()),
        cancel: AtomicBool::new(false),
    });
    manager
        .transfers
        .lock()
        .map_err(|_| "transfer registry lock poisoned".to_owned())?
        .insert(value.id.clone(), runtime.clone());
    spawn_worker(manager, server, runtime);
    Ok(value)
}

#[tauri::command]
pub(super) fn sftp_start_upload(
    transfers: State<'_, TransferManager>,
    server_id: String,
    local_path: String,
    remote_directory: String,
) -> Result<TransferSnapshot, String> {
    validate_path(&local_path, "local path")?;
    validate_path(&remote_directory, "remote directory")?;
    let metadata = fs::metadata(&local_path)
        .map_err(|error| format!("could not read local file metadata: {error}"))?;
    if !metadata.is_file() {
        return Err("transfer queue currently accepts files only; recursive folders are the next slice".to_owned());
    }
    let file_name = Path::new(&local_path)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "could not determine local file name".to_owned())?;
    let remote_path = join_remote(&remote_directory, file_name);
    let server = super::find_server(&server_id)?;
    enqueue(
        transfers.inner().clone(),
        server,
        "upload",
        local_path,
        remote_path,
        metadata.len(),
    )
}

#[tauri::command]
pub(super) fn sftp_start_download(
    transfers: State<'_, TransferManager>,
    server_id: String,
    remote_path: String,
    local_path: String,
) -> Result<TransferSnapshot, String> {
    validate_path(&remote_path, "remote path")?;
    validate_path(&local_path, "local path")?;
    let server = super::find_server(&server_id)?;
    let bytes_total = remote_file_size(&server, &remote_path).unwrap_or_default();
    enqueue(
        transfers.inner().clone(),
        server,
        "download",
        local_path,
        remote_path,
        bytes_total,
    )
}

#[tauri::command]
pub(super) fn sftp_transfer_list(
    transfers: State<'_, TransferManager>,
) -> Result<Vec<TransferSnapshot>, String> {
    let values = transfers
        .transfers
        .lock()
        .map_err(|_| "transfer registry lock poisoned".to_owned())?;
    let mut snapshots = values
        .values()
        .map(|value| snapshot(value))
        .collect::<Result<Vec<_>, _>>()?;
    snapshots.sort_by(|left, right| right.created_at_ms.cmp(&left.created_at_ms));
    Ok(snapshots)
}

#[tauri::command]
pub(super) fn sftp_cancel_transfer(
    transfers: State<'_, TransferManager>,
    transfer_id: String,
) -> Result<(), String> {
    let runtime = transfers
        .transfers
        .lock()
        .map_err(|_| "transfer registry lock poisoned".to_owned())?
        .get(&transfer_id)
        .cloned()
        .ok_or_else(|| format!("transfer {transfer_id} not found"))?;
    let current = snapshot(&runtime)?;
    if current.state == "queued" || current.state == "running" {
        runtime.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub(super) fn sftp_retry_transfer(
    transfers: State<'_, TransferManager>,
    transfer_id: String,
) -> Result<TransferSnapshot, String> {
    let old = {
        let values = transfers
            .transfers
            .lock()
            .map_err(|_| "transfer registry lock poisoned".to_owned())?;
        let runtime = values
            .get(&transfer_id)
            .ok_or_else(|| format!("transfer {transfer_id} not found"))?;
        snapshot(runtime)?
    };
    if old.state == "queued" || old.state == "running" {
        return Err("an active transfer cannot be retried".to_owned());
    }
    let server = super::find_server(&old.server_id)?;
    let bytes_total = if old.direction == "upload" {
        fs::metadata(&old.local_path)
            .map(|value| value.len())
            .unwrap_or(old.bytes_total)
    } else {
        remote_file_size(&server, &old.remote_path).unwrap_or(old.bytes_total)
    };
    enqueue(
        transfers.inner().clone(),
        server,
        &old.direction,
        old.local_path,
        old.remote_path,
        bytes_total,
    )
}

#[tauri::command]
pub(super) fn sftp_clear_finished(
    transfers: State<'_, TransferManager>,
) -> Result<usize, String> {
    let mut values = transfers
        .transfers
        .lock()
        .map_err(|_| "transfer registry lock poisoned".to_owned())?;
    let before = values.len();
    values.retain(|_, runtime| {
        snapshot(runtime)
            .map(|value| value.state == "queued" || value.state == "running")
            .unwrap_or(true)
    });
    Ok(before.saturating_sub(values.len()))
}

#[cfg(test)]
mod tests {
    use super::{join_remote, quote_arg};

    #[test]
    fn joins_remote_paths() {
        assert_eq!(join_remote("/", "app.log"), "/app.log");
        assert_eq!(join_remote("/srv", "app.log"), "/srv/app.log");
        assert_eq!(join_remote(".", "app.log"), "./app.log");
    }

    #[test]
    fn rejects_batch_injection() {
        assert!(quote_arg("bad\nrm *").is_err());
        assert_eq!(quote_arg("/srv/a b").unwrap(), "\"/srv/a b\"");
    }
}
