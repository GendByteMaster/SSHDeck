use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sshdeck::registry::ServerRecord;
use sshdeck::workspace::WorkspaceStore;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SftpDiagnosticStep {
    id: String,
    label: String,
    state: String,
    duration_ms: u64,
    detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SftpDiagnosticResult {
    server_id: String,
    state: String,
    category: String,
    summary: String,
    recommendation: Option<String>,
    checked_at: u64,
    duration_ms: u64,
    steps: Vec<SftpDiagnosticStep>,
}

struct Failure {
    category: &'static str,
    summary: String,
    recommendation: String,
    detail: String,
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}

fn checked_at() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

fn diagnostic_timeout_seconds() -> u64 {
    WorkspaceStore::load_default()
        .and_then(|store| store.load())
        .map(|workspace| workspace.settings.diagnostic_timeout_seconds)
        .unwrap_or(8)
        .clamp(2, 30)
}

fn target(server: &ServerRecord) -> String {
    match &server.user {
        Some(user) if !user.is_empty() => format!("{user}@{}", server.host),
        _ => server.host.clone(),
    }
}

fn append_ssh_target(command: &mut Command, server: &ServerRecord, timeout_seconds: u64) {
    command
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg(format!("ConnectTimeout={timeout_seconds}"))
        .arg("-o")
        .arg("ConnectionAttempts=1");

    if let Some(alias) = &server.source_alias {
        command.arg(alias);
        return;
    }

    command.arg("-p").arg(server.port.to_string());
    if let Some(identity_file) = &server.identity_file {
        command.arg("-i").arg(identity_file);
    }
    command.arg(target(server));
}

fn append_sftp_target(command: &mut Command, server: &ServerRecord, timeout_seconds: u64) {
    command
        .arg("-q")
        .arg("-b")
        .arg("-")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg(format!("ConnectTimeout={timeout_seconds}"))
        .arg("-o")
        .arg("ConnectionAttempts=1");

    if let Some(alias) = &server.source_alias {
        command.arg(alias);
        return;
    }

    command.arg("-P").arg(server.port.to_string());
    if let Some(identity_file) = &server.identity_file {
        command.arg("-i").arg(identity_file);
    }
    command.arg(target(server));
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("process exited with {}", output.status)
    }
}

fn classify_ssh_failure(detail: &str) -> Failure {
    let lowered = detail.to_ascii_lowercase();

    if lowered.contains("permission denied")
        || lowered.contains("authentication failed")
        || lowered.contains("no supported authentication methods")
    {
        return Failure {
            category: "authentication",
            summary: "SSH authentication failed".to_owned(),
            recommendation: "Verify the selected user, IdentityFile, ssh-agent, certificate, and OpenSSH alias. SFTP batch operations require non-interactive authentication.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    if lowered.contains("host key verification failed")
        || lowered.contains("remote host identification has changed")
    {
        return Failure {
            category: "host_key",
            summary: "SSH host key verification failed".to_owned(),
            recommendation: "Verify the server fingerprint before updating known_hosts. Do not bypass host-key verification for convenience.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    if lowered.contains("could not resolve hostname")
        || lowered.contains("name or service not known")
        || lowered.contains("nodename nor servname provided")
    {
        return Failure {
            category: "dns",
            summary: "SSH target could not be resolved".to_owned(),
            recommendation: "Check the hostname, DNS/VPN state, and the HostName resolved by your OpenSSH alias.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    if lowered.contains("banner exchange")
        || lowered.contains("kex_exchange_identification")
        || lowered.contains("connection closed by remote host")
        || lowered.contains("connection reset by peer")
    {
        return Failure {
            category: "ssh_service",
            summary: "TCP is reachable, but the SSH service did not complete the protocol handshake".to_owned(),
            recommendation: "The TCP connection was accepted, but sshd did not complete the SSH banner/key-exchange phase. Check that sshd is healthy and listening correctly, then inspect sshd logs, ProxyJump/ProxyCommand, firewall/fail2ban rules, and connection limits.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    if lowered.contains("no matching host key type")
        || lowered.contains("no matching key exchange method")
    {
        return Failure {
            category: "handshake",
            summary: "SSH algorithm negotiation failed".to_owned(),
            recommendation: "Inspect the client/server SSH algorithm configuration. Prefer updating the server configuration rather than re-enabling obsolete algorithms globally.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    if lowered.contains("connection timed out")
        || lowered.contains("operation timed out")
        || lowered.contains("no route to host")
        || lowered.contains("network is unreachable")
        || lowered.contains("connection refused")
    {
        return Failure {
            category: "network",
            summary: "SSH endpoint is not reachable".to_owned(),
            recommendation: "Check the server address/port, firewall or security group, VPN, and whether sshd is listening.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    Failure {
        category: "ssh",
        summary: "SSH probe failed".to_owned(),
        recommendation: "Run the same target with `ssh -vvv` in a terminal and inspect the server-side sshd logs for the exact rejection point.".to_owned(),
        detail: detail.to_owned(),
    }
}

fn classify_sftp_failure(detail: &str) -> Failure {
    let lowered = detail.to_ascii_lowercase();

    if lowered.contains("permission denied")
        || lowered.contains("authentication failed")
        || lowered.contains("no supported authentication methods")
    {
        return Failure {
            category: "authentication",
            summary: "SFTP authentication failed".to_owned(),
            recommendation: "Verify non-interactive OpenSSH authentication for this server. SSHDeck does not pass an interactive password into batch SFTP.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    if lowered.contains("subsystem request failed")
        || lowered.contains("subsystem request for sftp failed")
        || lowered.contains("connection closed")
        || lowered.contains("unexpected end of file")
        || lowered.contains("received message too long")
    {
        return Failure {
            category: "sftp_subsystem",
            summary: "SSH works, but the SFTP subsystem is unavailable".to_owned(),
            recommendation: "Check the server's sshd_config for a valid `Subsystem sftp ...` or `internal-sftp` entry, Match blocks, chroot rules, and sshd logs. Restart/reload sshd only after validating the configuration.".to_owned(),
            detail: detail.to_owned(),
        };
    }

    Failure {
        category: "sftp",
        summary: "SFTP subsystem probe failed".to_owned(),
        recommendation: "Inspect sshd logs and test `sftp <target>` manually. SSH connectivity can succeed while the SFTP subsystem is disabled or restricted.".to_owned(),
        detail: detail.to_owned(),
    }
}

fn tcp_probe(server: &ServerRecord, timeout_seconds: u64) -> SftpDiagnosticStep {
    if server.source_alias.is_some() {
        return SftpDiagnosticStep {
            id: "tcp".to_owned(),
            label: "TCP reachability".to_owned(),
            state: "skipped".to_owned(),
            duration_ms: 0,
            detail: "Skipped for an imported OpenSSH alias because ProxyJump/ProxyCommand or a different resolved HostName may be involved.".to_owned(),
        };
    }

    let started = Instant::now();
    let address = format!("{}:{}", server.host, server.port);
    let addresses = match address.to_socket_addrs() {
        Ok(values) => values.collect::<Vec<_>>(),
        Err(error) => {
            return SftpDiagnosticStep {
                id: "tcp".to_owned(),
                label: "TCP reachability".to_owned(),
                state: "failed".to_owned(),
                duration_ms: elapsed_ms(started),
                detail: format!("Could not resolve {address}: {error}"),
            };
        }
    };

    if addresses.is_empty() {
        return SftpDiagnosticStep {
            id: "tcp".to_owned(),
            label: "TCP reachability".to_owned(),
            state: "failed".to_owned(),
            duration_ms: elapsed_ms(started),
            detail: format!("No socket addresses resolved for {address}"),
        };
    }

    let timeout = Duration::from_secs(timeout_seconds.clamp(2, 30));
    let mut last_error = None;
    for socket in addresses {
        match TcpStream::connect_timeout(&socket, timeout) {
            Ok(_) => {
                return SftpDiagnosticStep {
                    id: "tcp".to_owned(),
                    label: "TCP reachability".to_owned(),
                    state: "passed".to_owned(),
                    duration_ms: elapsed_ms(started),
                    detail: format!("Connected to {socket}"),
                };
            }
            Err(error) => last_error = Some(format!("{socket}: {error}")),
        }
    }

    SftpDiagnosticStep {
        id: "tcp".to_owned(),
        label: "TCP reachability".to_owned(),
        state: "failed".to_owned(),
        duration_ms: elapsed_ms(started),
        detail: last_error.unwrap_or_else(|| format!("Could not connect to {address}")),
    }
}

fn ssh_probe(server: &ServerRecord, timeout_seconds: u64) -> Result<SftpDiagnosticStep, Failure> {
    let started = Instant::now();
    let mut command = Command::new("ssh");
    append_ssh_target(&mut command, server, timeout_seconds);
    command.arg("printf '__SSHDECK_DIAG_OK__\\n'");

    let output = command.output().map_err(|error| Failure {
        category: "client_missing",
        summary: "OpenSSH ssh client could not be started".to_owned(),
        recommendation: "Install or enable the system OpenSSH client and ensure `ssh` is available on PATH.".to_owned(),
        detail: error.to_string(),
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if output.status.success() && stdout.lines().any(|line| line == "__SSHDECK_DIAG_OK__") {
        return Ok(SftpDiagnosticStep {
            id: "ssh".to_owned(),
            label: "SSH handshake & authentication".to_owned(),
            state: "passed".to_owned(),
            duration_ms: elapsed_ms(started),
            detail: "OpenSSH established an authenticated SSH session.".to_owned(),
        });
    }

    let mut failure = classify_ssh_failure(&output_detail(&output));
    failure.detail = format!("{} ({} ms)", failure.detail, elapsed_ms(started));
    Err(failure)
}

fn sftp_probe(server: &ServerRecord, timeout_seconds: u64) -> Result<SftpDiagnosticStep, Failure> {
    let started = Instant::now();
    let mut command = Command::new("sftp");
    append_sftp_target(&mut command, server, timeout_seconds);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| Failure {
            category: "client_missing",
            summary: "OpenSSH sftp client could not be started".to_owned(),
            recommendation: "Install or enable the system OpenSSH client and ensure `sftp` is available on PATH.".to_owned(),
            detail: error.to_string(),
        })?;

    child
        .stdin
        .as_mut()
        .ok_or_else(|| Failure {
            category: "client",
            summary: "SFTP diagnostic stdin is unavailable".to_owned(),
            recommendation: "Restart SSHDeck and verify the system OpenSSH installation.".to_owned(),
            detail: "OpenSSH sftp process did not expose stdin".to_owned(),
        })?
        .write_all(b"pwd\nquit\n")
        .map_err(|error| Failure {
            category: "client",
            summary: "Could not send the SFTP diagnostic probe".to_owned(),
            recommendation: "Restart SSHDeck and verify the system OpenSSH installation.".to_owned(),
            detail: error.to_string(),
        })?;
    drop(child.stdin.take());

    let output = child.wait_with_output().map_err(|error| Failure {
        category: "client",
        summary: "Could not wait for the SFTP diagnostic probe".to_owned(),
        recommendation: "Restart SSHDeck and verify the system OpenSSH installation.".to_owned(),
        detail: error.to_string(),
    })?;

    if output.status.success() {
        return Ok(SftpDiagnosticStep {
            id: "sftp".to_owned(),
            label: "SFTP subsystem".to_owned(),
            state: "passed".to_owned(),
            duration_ms: elapsed_ms(started),
            detail: "The server accepted an SFTP subsystem session and responded to `pwd`.".to_owned(),
        });
    }

    let mut failure = classify_sftp_failure(&output_detail(&output));
    failure.detail = format!("{} ({} ms)", failure.detail, elapsed_ms(started));
    Err(failure)
}

fn failed_step(id: &str, label: &str, failure: &Failure) -> SftpDiagnosticStep {
    SftpDiagnosticStep {
        id: id.to_owned(),
        label: label.to_owned(),
        state: "failed".to_owned(),
        duration_ms: 0,
        detail: failure.detail.clone(),
    }
}

fn skipped_step(id: &str, label: &str, detail: &str) -> SftpDiagnosticStep {
    SftpDiagnosticStep {
        id: id.to_owned(),
        label: label.to_owned(),
        state: "skipped".to_owned(),
        duration_ms: 0,
        detail: detail.to_owned(),
    }
}

pub(super) fn sftp_diagnose(server_id: String) -> Result<SftpDiagnosticResult, String> {
    let server = super::find_server(&server_id)?;
    let timeout_seconds = diagnostic_timeout_seconds();
    let started = Instant::now();
    let checked_at = checked_at();
    let mut steps = vec![tcp_probe(&server, timeout_seconds)];

    match ssh_probe(&server, timeout_seconds) {
        Ok(step) => steps.push(step),
        Err(failure) => {
            steps.push(failed_step("ssh", "SSH handshake & authentication", &failure));
            steps.push(skipped_step(
                "sftp",
                "SFTP subsystem",
                "Skipped because the authenticated SSH probe did not succeed.",
            ));
            return Ok(SftpDiagnosticResult {
                server_id,
                state: "failed".to_owned(),
                category: failure.category.to_owned(),
                summary: failure.summary,
                recommendation: Some(failure.recommendation),
                checked_at,
                duration_ms: elapsed_ms(started),
                steps,
            });
        }
    }

    match sftp_probe(&server, timeout_seconds) {
        Ok(step) => {
            steps.push(step);
            Ok(SftpDiagnosticResult {
                server_id,
                state: "healthy".to_owned(),
                category: "ok".to_owned(),
                summary: "SSH and SFTP are working".to_owned(),
                recommendation: None,
                checked_at,
                duration_ms: elapsed_ms(started),
                steps,
            })
        }
        Err(failure) => {
            steps.push(failed_step("sftp", "SFTP subsystem", &failure));
            Ok(SftpDiagnosticResult {
                server_id,
                state: "failed".to_owned(),
                category: failure.category.to_owned(),
                summary: failure.summary,
                recommendation: Some(failure.recommendation),
                checked_at,
                duration_ms: elapsed_ms(started),
                steps,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_sftp_failure, classify_ssh_failure};

    #[test]
    fn classifies_authentication_failure() {
        let failure = classify_ssh_failure("git@example: Permission denied (publickey).");
        assert_eq!(failure.category, "authentication");
    }

    #[test]
    fn classifies_network_failure() {
        let failure = classify_ssh_failure("ssh: connect to host example port 22: Connection refused");
        assert_eq!(failure.category, "network");
    }

    #[test]
    fn classifies_banner_timeout_as_ssh_service_failure() {
        let failure = classify_ssh_failure(
            "Connection timed out during banner exchange\r\nConnection to 161.104.17.83 port 22 timed out",
        );
        assert_eq!(failure.category, "ssh_service");
        assert!(failure.summary.contains("TCP is reachable"));
    }

    #[test]
    fn treats_connection_closed_after_ssh_as_sftp_subsystem_failure() {
        let failure = classify_sftp_failure("Connection closed");
        assert_eq!(failure.category, "sftp_subsystem");
        assert!(failure.summary.contains("SFTP subsystem"));
    }
}
