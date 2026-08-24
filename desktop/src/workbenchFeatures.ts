// Production UI surfaces must be derived from this registry so planned features
// cannot accidentally appear as working controls before their end-to-end flow exists.
export type FeatureReadiness = "ready" | "experimental" | "planned";

export type ActivityFeatureId =
  | "servers"
  | "sftp"
  | "search"
  | "ports"
  | "sessions"
  | "history"
  | "transfers"
  | "settings";

export type PanelFeatureId = "ports" | "logs" | "transfers";

export type WorkbenchFeature<TId extends string> = {
  id: TId;
  label: string;
  description: string;
  readiness: FeatureReadiness;
};

export const activityFeatures: WorkbenchFeature<ActivityFeatureId>[] = [
  {
    id: "servers",
    label: "Servers",
    description: "Manage and connect to SSHDeck server entries.",
    readiness: "ready",
  },
  {
    id: "sftp",
    label: "Remote files",
    description: "Browse remote files over the system OpenSSH SFTP client.",
    readiness: "ready",
  },
  {
    id: "search",
    label: "Search",
    description: "Search across SSHDeck workspace entities.",
    readiness: "planned",
  },
  {
    id: "ports",
    label: "Port forwarding",
    description: "Manage local, remote, and SOCKS tunnels as a dedicated workspace.",
    readiness: "planned",
  },
  {
    id: "sessions",
    label: "Sessions",
    description: "Inspect and control all SSH sessions from one workspace.",
    readiness: "planned",
  },
  {
    id: "history",
    label: "History",
    description: "Review full SSH session history and reconnect from previous sessions.",
    readiness: "planned",
  },
  {
    id: "transfers",
    label: "Transfers",
    description: "Open the global SFTP transfer queue.",
    readiness: "ready",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Configure SSHDeck workspace behavior and safety policies.",
    readiness: "planned",
  },
];

export const panelFeatures: WorkbenchFeature<PanelFeatureId>[] = [
  {
    id: "ports",
    label: "Ports",
    description: "Managed SSH port forwarding state.",
    readiness: "planned",
  },
  {
    id: "logs",
    label: "Logs",
    description: "Structured SSH, SFTP, tunnel, and transfer diagnostics.",
    readiness: "planned",
  },
  {
    id: "transfers",
    label: "Transfers",
    description: "Global SFTP transfer queue with progress, cancel, and retry.",
    readiness: "ready",
  },
];

export function isProductionReady(readiness: FeatureReadiness) {
  return readiness === "ready" || readiness === "experimental";
}

export function productionActivityFeatures() {
  return activityFeatures.filter((feature) => isProductionReady(feature.readiness));
}

export function productionPanelFeatures() {
  return panelFeatures.filter((feature) => isProductionReady(feature.readiness));
}

export function activityFeature(id: ActivityFeatureId) {
  return activityFeatures.find((feature) => feature.id === id);
}

export function panelFeature(id: PanelFeatureId) {
  return panelFeatures.find((feature) => feature.id === id);
}
