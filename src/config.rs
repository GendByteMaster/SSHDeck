use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};

pub struct SshConfig {
    path: PathBuf,
    hosts: BTreeSet<String>,
}

impl SshConfig {
    pub fn load_default() -> Result<Self> {
        let home = dirs::home_dir().context("failed to resolve home directory")?;
        Self::load(home.join(".ssh").join("config"))
    }

    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if !path.exists() {
            return Ok(Self {
                path,
                hosts: BTreeSet::new(),
            });
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let hosts = parse_hosts(&content);

        Ok(Self { path, hosts })
    }

    pub fn hosts(&self) -> impl Iterator<Item = &str> {
        self.hosts.iter().map(String::as_str)
    }

    pub fn require_host(&self, host: &str) -> Result<()> {
        if self.hosts.contains(host) {
            return Ok(());
        }

        bail!(
            "SSH host alias '{host}' was not found in {}",
            self.path.display()
        )
    }
}

fn parse_hosts(content: &str) -> BTreeSet<String> {
    let mut hosts = BTreeSet::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let mut parts = line.split_whitespace();
        let Some(keyword) = parts.next() else {
            continue;
        };

        if !keyword.eq_ignore_ascii_case("host") {
            continue;
        }

        for alias in parts {
            if !contains_pattern(alias) {
                hosts.insert(alias.to_owned());
            }
        }
    }

    hosts
}

fn contains_pattern(value: &str) -> bool {
    value.contains('*') || value.contains('?') || value.contains('!')
}

#[cfg(test)]
mod tests {
    use super::parse_hosts;

    #[test]
    fn parses_literal_hosts_and_skips_patterns() {
        let config = r#"
            Host voxelyra prod
                HostName 203.0.113.10
                User deploy

            Host *.internal
                User admin

            Host *
                ServerAliveInterval 30
        "#;

        let hosts: Vec<_> = parse_hosts(config).into_iter().collect();
        assert_eq!(hosts, vec!["prod", "voxelyra"]);
    }
}
