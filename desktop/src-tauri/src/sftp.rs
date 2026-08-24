use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use serde::Serialize;
use sshdeck::registry::ServerRecord;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SftpEntry {
    name: String,
    path: String,
    kind: String,
    size: u64,
    permissions: String,
    modified: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SftpTransferResult {
    local_path: String,
    remote_path: String,
    bytes: u64,
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

fn run_batch(server: &ServerRecord, script: &str) -> Result<String, String> {
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
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    if detail.to_ascii_lowercase().contains("permission denied") {
        return Err(format!(
            "SFTP authentication failed. This workspace currently requires non-interactive OpenSSH authentication (ssh-agent, key, certificate, or imported OpenSSH config). {detail}"
        ));
    }
    Err(if detail.is_empty() {
        "OpenSSH sftp command failed".to_owned()
    } else {
        format!("OpenSSH sftp command failed: {detail}")
    })
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

fn parse_listing(path: &str, output: &str) -> Vec<SftpEntry> {
    let mut entries = Vec::new();
    for raw in output.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("sftp>") || line.starts_with("Remote working directory:") {
            continue;
        }
        let columns: Vec<&str> = line.split_whitespace().collect();
        if columns.len() < 9 {
            continue;
        }
        let permissions = columns[0];
        let first = permissions.as_bytes().first().copied().unwrap_or_default();
        if !matches!(first, b'-' | b'd' | b'l' | b'b' | b'c' | b'p' | b's') {
            continue;
        }
        let mut name = columns[8..].join(" ");
        if first == b'l' {
            if let Some((source, _)) = name.split_once(" -> ") {
                name = source.to_owned();
            }
        }
        if name == "." || name == ".." {
            continue;
        }
        let kind = match first {
            b'd' => "directory",
            b'l' => "symlink",
            _ => "file",
        };
        entries.push(SftpEntry {
            path: join_remote(path, &name),
            name,
            kind: kind.to_owned(),
            size: columns[4].parse().unwrap_or_default(),
            permissions: permissions.to_owned(),
            modified: format!("{} {} {}", columns[5], columns[6], columns[7]),
        });
    }
    entries.sort_by(|left, right| {
        let left_rank = if left.kind == "directory" { 0 } else { 1 };
        let right_rank = if right.kind == "directory" { 0 } else { 1 };
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    entries
}

#[tauri::command]
pub(super) fn sftp_list_directory(server_id: String, path: String) -> Result<Vec<SftpEntry>, String> {
    let server = super::find_server(&server_id)?;
    validate_path(&path, "remote path")?;
    let output = run_batch(&server, &format!("ls -lan {}\n", quote_arg(&path)?))?;
    Ok(parse_listing(&path, &output))
}

#[tauri::command]
pub(super) fn sftp_create_directory(server_id: String, path: String) -> Result<(), String> {
    let server = super::find_server(&server_id)?;
    run_batch(&server, &format!("mkdir {}\n", quote_arg(&path)?)).map(|_| ())
}

#[tauri::command]
pub(super) fn sftp_rename(server_id: String, old_path: String, new_path: String) -> Result<(), String> {
    let server = super::find_server(&server_id)?;
    run_batch(
        &server,
        &format!("rename {} {}\n", quote_arg(&old_path)?, quote_arg(&new_path)?),
    )
    .map(|_| ())
}

#[tauri::command]
pub(super) fn sftp_remove(server_id: String, path: String, is_directory: bool) -> Result<(), String> {
    let server = super::find_server(&server_id)?;
    let command = if is_directory { "rmdir" } else { "rm" };
    run_batch(&server, &format!("{command} {}\n", quote_arg(&path)?)).map(|_| ())
}

#[tauri::command]
pub(super) fn sftp_upload(
    server_id: String,
    local_path: String,
    remote_directory: String,
) -> Result<SftpTransferResult, String> {
    let server = super::find_server(&server_id)?;
    validate_path(&local_path, "local path")?;
    validate_path(&remote_directory, "remote directory")?;
    let file_name = Path::new(&local_path)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "could not determine local file name".to_owned())?;
    let remote_path = join_remote(&remote_directory, file_name);
    run_batch(
        &server,
        &format!("put {} {}\n", quote_arg(&local_path)?, quote_arg(&remote_path)?),
    )?;
    let bytes = std::fs::metadata(&local_path)
        .map(|value| value.len())
        .unwrap_or_default();
    Ok(SftpTransferResult {
        local_path,
        remote_path,
        bytes,
    })
}

#[tauri::command]
pub(super) fn sftp_download(
    server_id: String,
    remote_path: String,
    local_path: String,
) -> Result<SftpTransferResult, String> {
    let server = super::find_server(&server_id)?;
    validate_path(&remote_path, "remote path")?;
    validate_path(&local_path, "local path")?;
    run_batch(
        &server,
        &format!("get {} {}\n", quote_arg(&remote_path)?, quote_arg(&local_path)?),
    )?;
    let bytes = std::fs::metadata(&local_path)
        .map(|value| value.len())
        .unwrap_or_default();
    Ok(SftpTransferResult {
        local_path,
        remote_path,
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_listing, quote_arg};

    #[test]
    fn parses_directories_and_files() {
        let output = "drwxr-xr-x    2 1000 1000 4096 Aug 24 12:00 logs\n-rw-r--r--    1 1000 1000 42 Aug 24 11:00 app config.toml\n";
        let values = parse_listing("/srv/app", output);
        assert_eq!(values.len(), 2);
        assert_eq!(values[0].kind, "directory");
        assert_eq!(values[0].path, "/srv/app/logs");
        assert_eq!(values[1].name, "app config.toml");
        assert_eq!(values[1].size, 42);
    }

    #[test]
    fn quotes_batch_arguments() {
        assert_eq!(quote_arg("/srv/a b").unwrap(), "\"/srv/a b\"");
        assert!(quote_arg("bad\nrm *").is_err());
    }
}
