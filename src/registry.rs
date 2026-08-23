use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRecord {
    pub id: String,
    pub name: String,
    pub host: String,
    pub user: Option<String>,
    #[serde(default = "default_port")]
    pub port: u16,
    pub identity_file: Option<String>,
    pub group: Option<String>,
    #[serde(default)]
    pub favorite: bool,
    pub source_alias: Option<String>,
    pub last_connected_at: Option<u64>,
}

fn default_port() -> u16 {
    22
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct RegistryFile {
    #[serde(default)]
    servers: Vec<ServerRecord>,
}

pub struct ServerRegistry {
    path: PathBuf,
}

impl ServerRegistry {
    pub fn load_default() -> Result<Self> {
        let base = dirs::config_dir().context("failed to resolve config directory")?;
        Ok(Self {
            path: base.join("SSHDeck").join("servers.json"),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn list(&self) -> Result<Vec<ServerRecord>> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let data = fs::read_to_string(&self.path)
            .with_context(|| format!("failed to read {}", self.path.display()))?;
        let mut registry: RegistryFile = serde_json::from_str(&data)
            .with_context(|| format!("failed to parse {}", self.path.display()))?;
        registry.servers.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| b.last_connected_at.cmp(&a.last_connected_at))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(registry.servers)
    }

    pub fn upsert(&self, server: ServerRecord) -> Result<()> {
        let mut servers = self.list()?;
        if let Some(existing) = servers.iter_mut().find(|item| item.id == server.id) {
            *existing = server;
        } else {
            servers.push(server);
        }
        self.write(servers)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let mut servers = self.list()?;
        servers.retain(|server| server.id != id);
        self.write(servers)
    }

    pub fn touch_recent(&self, id: &str, timestamp: u64) -> Result<()> {
        let mut servers = self.list()?;
        if let Some(server) = servers.iter_mut().find(|item| item.id == id) {
            server.last_connected_at = Some(timestamp);
        }
        self.write(servers)
    }

    fn write(&self, servers: Vec<ServerRecord>) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        let payload = serde_json::to_string_pretty(&RegistryFile { servers })?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, payload)
            .with_context(|| format!("failed to write {}", tmp.display()))?;
        if self.path.exists() {
            fs::remove_file(&self.path)
                .with_context(|| format!("failed to replace {}", self.path.display()))?;
        }
        fs::rename(&tmp, &self.path)
            .with_context(|| format!("failed to replace {}", self.path.display()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{ServerRecord, ServerRegistry};
    use tempfile::tempdir;

    #[test]
    fn upsert_delete_and_sort_servers() {
        let dir = tempdir().unwrap();
        let registry = ServerRegistry {
            path: dir.path().join("servers.json"),
        };
        registry
            .upsert(ServerRecord {
                id: "a".into(),
                name: "Alpha".into(),
                host: "alpha.example".into(),
                user: Some("deploy".into()),
                port: 22,
                identity_file: None,
                group: None,
                favorite: false,
                source_alias: None,
                last_connected_at: Some(10),
            })
            .unwrap();
        registry
            .upsert(ServerRecord {
                id: "b".into(),
                name: "Beta".into(),
                host: "beta.example".into(),
                user: None,
                port: 2222,
                identity_file: None,
                group: Some("Prod".into()),
                favorite: true,
                source_alias: None,
                last_connected_at: None,
            })
            .unwrap();
        let servers = registry.list().unwrap();
        assert_eq!(servers[0].id, "b");
        registry.delete("b").unwrap();
        assert_eq!(registry.list().unwrap().len(), 1);
    }
}
