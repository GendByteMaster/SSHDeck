use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

pub const SETTINGS_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    pub server_id: Option<String>,
    pub group: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelRecord {
    pub id: String,
    pub name: String,
    pub server_id: String,
    pub kind: TunnelKind,
    pub bind_host: Option<String>,
    pub local_port: u16,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    #[serde(default)]
    pub auto_restart: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelKind {
    Local,
    Remote,
    Dynamic,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistoryRecord {
    pub id: String,
    pub server_id: String,
    pub server_name: String,
    pub state: String,
    pub at_ms: u64,
    #[serde(default)]
    pub started_at_ms: Option<u64>,
    pub duration_ms: u64,
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub signal: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CommandSafetyPolicy {
    #[default]
    Standard,
    Strict,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct WorkspaceSettings {
    pub schema_version: u32,
    pub auto_reconnect_default: bool,
    pub diagnostic_timeout_seconds: u64,
    pub transfer_concurrency: usize,
    pub command_safety_policy: CommandSafetyPolicy,
    pub restore_workspace_layout: bool,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            auto_reconnect_default: true,
            diagnostic_timeout_seconds: 8,
            transfer_concurrency: 2,
            command_safety_policy: CommandSafetyPolicy::Standard,
            restore_workspace_layout: true,
        }
    }
}

impl WorkspaceSettings {
    pub fn migrate(&mut self) -> Result<()> {
        match self.schema_version {
            0 => {
                self.schema_version = SETTINGS_SCHEMA_VERSION;
                self.diagnostic_timeout_seconds = self.diagnostic_timeout_seconds.clamp(2, 30);
                self.transfer_concurrency = self.transfer_concurrency.clamp(1, 6);
            }
            SETTINGS_SCHEMA_VERSION => {}
            version => bail!(
                "unsupported settings schema version {version}; this SSHDeck build supports version {SETTINGS_SCHEMA_VERSION}"
            ),
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<()> {
        if self.schema_version != SETTINGS_SCHEMA_VERSION {
            bail!(
                "settings schema version must be {SETTINGS_SCHEMA_VERSION}, got {}",
                self.schema_version
            );
        }
        if !(2..=30).contains(&self.diagnostic_timeout_seconds) {
            bail!("diagnostic timeout must be between 2 and 30 seconds");
        }
        if !(1..=6).contains(&self.transfer_concurrency) {
            bail!("transfer concurrency must be between 1 and 6");
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchLayout {
    pub primary_visible: bool,
    pub secondary_visible: bool,
    pub panel_visible: bool,
    pub panel_tab: String,
    pub primary_width: u16,
}

impl Default for WorkbenchLayout {
    fn default() -> Self {
        Self {
            primary_visible: true,
            secondary_visible: true,
            panel_visible: false,
            panel_tab: "terminal".to_owned(),
            primary_width: 320,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    #[serde(default)]
    pub quick_commands: Vec<QuickCommand>,
    #[serde(default)]
    pub tunnels: Vec<TunnelRecord>,
    #[serde(default)]
    pub session_history: Vec<SessionHistoryRecord>,
    #[serde(default)]
    pub layout: WorkbenchLayout,
    #[serde(default)]
    pub settings: WorkspaceSettings,
}

pub struct WorkspaceStore {
    path: PathBuf,
}

impl WorkspaceStore {
    pub fn load_default() -> Result<Self> {
        let base = dirs::config_dir().context("failed to resolve config directory")?;
        Ok(Self {
            path: base.join("SSHDeck").join("workspace.json"),
        })
    }

    pub fn load(&self) -> Result<WorkspaceData> {
        if !self.path.exists() {
            return Ok(WorkspaceData::default());
        }
        let data = fs::read_to_string(&self.path)
            .with_context(|| format!("failed to read {}", self.path.display()))?;
        let mut workspace: WorkspaceData = serde_json::from_str(&data)
            .with_context(|| format!("failed to parse {}", self.path.display()))?;
        workspace.settings.migrate()?;
        workspace.settings.validate()?;
        Ok(workspace)
    }

    pub fn save(&self, data: &WorkspaceData) -> Result<()> {
        data.settings.validate()?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        let payload = serde_json::to_string_pretty(data)?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, payload).with_context(|| format!("failed to write {}", tmp.display()))?;
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
    use super::{
        CommandSafetyPolicy, SETTINGS_SCHEMA_VERSION, SessionHistoryRecord, WorkspaceData,
        WorkspaceSettings,
    };

    #[test]
    fn legacy_history_record_keeps_loading_without_new_optional_fields() {
        let record: SessionHistoryRecord = serde_json::from_str(
            r#"{
                "id":"legacy",
                "serverId":"server-1",
                "serverName":"Legacy",
                "state":"closed",
                "atMs":10,
                "durationMs":5,
                "exitCode":0
            }"#,
        )
        .expect("legacy history should remain compatible");

        assert_eq!(record.started_at_ms, None);
        assert_eq!(record.signal, None);
    }

    #[test]
    fn legacy_workspace_without_settings_gets_v1_defaults() {
        let workspace: WorkspaceData = serde_json::from_str(
            r#"{
                "quickCommands":[],
                "tunnels":[],
                "sessionHistory":[],
                "layout":{
                    "primaryVisible":true,
                    "secondaryVisible":true,
                    "panelVisible":false,
                    "panelTab":"transfers",
                    "primaryWidth":320
                }
            }"#,
        )
        .expect("legacy workspace should deserialize");

        assert_eq!(workspace.settings.schema_version, SETTINGS_SCHEMA_VERSION);
        assert!(workspace.settings.auto_reconnect_default);
        assert_eq!(workspace.settings.diagnostic_timeout_seconds, 8);
        assert_eq!(workspace.settings.transfer_concurrency, 2);
        assert_eq!(
            workspace.settings.command_safety_policy,
            CommandSafetyPolicy::Standard
        );
        assert!(workspace.settings.restore_workspace_layout);
    }

    #[test]
    fn settings_v0_migrates_and_clamps_legacy_values() {
        let mut settings: WorkspaceSettings = serde_json::from_str(
            r#"{
                "schemaVersion":0,
                "diagnosticTimeoutSeconds":60,
                "transferConcurrency":0
            }"#,
        )
        .expect("v0 settings should deserialize");

        settings.migrate().expect("v0 settings should migrate");
        assert_eq!(settings.schema_version, SETTINGS_SCHEMA_VERSION);
        assert_eq!(settings.diagnostic_timeout_seconds, 30);
        assert_eq!(settings.transfer_concurrency, 1);
        settings
            .validate()
            .expect("migrated settings should be valid");
    }

    #[test]
    fn current_settings_outside_supported_ranges_are_rejected() {
        let settings = WorkspaceSettings {
            diagnostic_timeout_seconds: 31,
            transfer_concurrency: 7,
            ..WorkspaceSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn future_settings_schema_is_rejected() {
        let mut settings = WorkspaceSettings {
            schema_version: SETTINGS_SCHEMA_VERSION + 1,
            ..WorkspaceSettings::default()
        };
        assert!(settings.migrate().is_err());
    }
}
