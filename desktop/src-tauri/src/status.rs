use std::process::Command;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sshdeck::registry::ServerRecord;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub server_id: String,
    pub state: ServerState,
    pub latency_ms: Option<u64>,
    pub ssh_ok: bool,
    pub uptime_seconds: Option<u64>,
    pub checked_at: u64,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ServerState {
    Online,
    AuthRequired,
    Offline,
    Error,
}

pub fn probe(server: &ServerRecord) -> ServerStatus {
    let started = Instant::now();
    let checked_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();

    let mut command = Command::new("ssh");
    command
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=4")
        .arg("-o")
        .arg("ConnectionAttempts=1");

    append_target(&mut command, server);
    command.arg("printf '__SSHDECK_OK__\\n'; cat /proc/uptime 2>/dev/null || true");

    let output = match command.output() {
        Ok(output) => output,
        Err(error) => {
            return ServerStatus {
                server_id: server.id.clone(),
                state: ServerState::Error,
                latency_ms: None,
                ssh_ok: false,
                uptime_seconds: None,
                checked_at,
                error: Some(format!("failed to start ssh: {error}")),
            };
        }
    };

    let latency_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() && stdout.lines().next() == Some("__SSHDECK_OK__") {
        return ServerStatus {
            server_id: server.id.clone(),
            state: ServerState::Online,
            latency_ms: Some(latency_ms),
            ssh_ok: true,
            uptime_seconds: parse_uptime(&stdout),
            checked_at,
            error: None,
        };
    }

    let error = stderr.trim().to_owned();
    let lowered = error.to_lowercase();
    let state = if lowered.contains("permission denied")
        || lowered.contains("no supported authentication methods")
    {
        ServerState::AuthRequired
    } else if lowered.contains("connection timed out")
        || lowered.contains("connection refused")
        || lowered.contains("no route to host")
        || lowered.contains("could not resolve hostname")
        || lowered.contains("name or service not known")
        || lowered.contains("operation timed out")
    {
        ServerState::Offline
    } else {
        ServerState::Error
    };

    ServerStatus {
        server_id: server.id.clone(),
        state,
        latency_ms: Some(latency_ms),
        ssh_ok: false,
        uptime_seconds: None,
        checked_at,
        error: if error.is_empty() { None } else { Some(error) },
    }
}

fn append_target(command: &mut Command, server: &ServerRecord) {
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

fn parse_uptime(stdout: &str) -> Option<u64> {
    stdout
        .lines()
        .skip(1)
        .find_map(|line| line.split_whitespace().next())
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as u64)
}

#[cfg(test)]
mod tests {
    use super::parse_uptime;

    #[test]
    fn parses_linux_uptime_after_probe_marker() {
        assert_eq!(parse_uptime("__SSHDECK_OK__\n1234.56 789.10\n"), Some(1234));
    }

    #[test]
    fn accepts_missing_uptime() {
        assert_eq!(parse_uptime("__SSHDECK_OK__\n"), None);
    }
}
