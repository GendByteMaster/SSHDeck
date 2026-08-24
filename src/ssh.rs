use std::process::{Command, Stdio};

use anyhow::{Context, Result, bail};

#[derive(Debug, Default)]
pub struct SshClient;

impl SshClient {
    pub fn connect(&self, host: &str) -> Result<()> {
        let status = Command::new("ssh")
            .arg(host)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .with_context(|| "failed to launch system OpenSSH client ('ssh')")?;

        if status.success() {
            Ok(())
        } else {
            bail!("SSH session exited with status {status}")
        }
    }

    pub fn exec(&self, host: &str, command: &[String]) -> Result<i32> {
        let status = Command::new("ssh")
            .arg(host)
            .arg("--")
            .args(command)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .with_context(|| "failed to launch system OpenSSH client ('ssh')")?;

        Ok(status.code().unwrap_or(1))
    }
}
