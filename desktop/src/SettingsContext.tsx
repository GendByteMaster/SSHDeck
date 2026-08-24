import { invoke } from "@tauri-apps/api/core";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const SETTINGS_SCHEMA_VERSION = 1;

export type CommandSafetyPolicy = "standard" | "strict";

export type WorkspaceSettings = {
  schemaVersion: number;
  autoReconnectDefault: boolean;
  diagnosticTimeoutSeconds: number;
  transferConcurrency: number;
  commandSafetyPolicy: CommandSafetyPolicy;
  restoreWorkspaceLayout: boolean;
};

type WorkspaceSnapshot = { settings?: WorkspaceSettings };

type SettingsContextValue = {
  settings: WorkspaceSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveSettings: (settings: WorkspaceSettings) => Promise<WorkspaceSettings>;
};

export const defaultWorkspaceSettings: WorkspaceSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  autoReconnectDefault: true,
  diagnosticTimeoutSeconds: 8,
  transferConcurrency: 2,
  commandSafetyPolicy: "standard",
  restoreWorkspaceLayout: true,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function normalizeSettings(value?: WorkspaceSettings): WorkspaceSettings {
  if (!value) return defaultWorkspaceSettings;
  return {
    schemaVersion: value.schemaVersion ?? SETTINGS_SCHEMA_VERSION,
    autoReconnectDefault: value.autoReconnectDefault ?? true,
    diagnosticTimeoutSeconds: value.diagnosticTimeoutSeconds ?? 8,
    transferConcurrency: value.transferConcurrency ?? 2,
    commandSafetyPolicy: value.commandSafetyPolicy === "strict" ? "strict" : "standard",
    restoreWorkspaceLayout: value.restoreWorkspaceLayout ?? true,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const workspace = await invoke<WorkspaceSnapshot>("workspace_load");
      setSettings(normalizeSettings(workspace.settings));
      setError(null);
      setLoading(false);
    } catch (value) {
      // Stay in a not-ready state so consumers fail closed rather than silently
      // falling back to a weaker/default policy when persisted settings are invalid.
      setError(`Could not load settings: ${String(value)}`);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const saveSettings = useCallback(async (next: WorkspaceSettings) => {
    setSaving(true);
    try {
      const candidate: WorkspaceSettings = {
        ...next,
        schemaVersion: SETTINGS_SCHEMA_VERSION,
      };
      const workspace = await invoke<WorkspaceSnapshot>("workspace_save_settings", { settings: candidate });
      const saved = normalizeSettings(workspace.settings ?? candidate);
      setSettings(saved);
      setError(null);
      return saved;
    } catch (value) {
      const message = `Could not save settings: ${String(value)}`;
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    loading,
    saving,
    error,
    reload,
    saveSettings,
  }), [error, loading, reload, saveSettings, saving, settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
