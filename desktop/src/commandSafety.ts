export type CommandRiskLevel = "low" | "medium" | "high" | "critical";

export type CommandRisk = {
  level: CommandRiskLevel;
  reasons: string[];
};

type Rule = {
  level: Exclude<CommandRiskLevel, "low">;
  pattern: RegExp;
  reason: string;
};

const rules: Rule[] = [
  { level: "critical", pattern: /\brm\s+-[^\n;|&]*r[^\n;|&]*f[^\n;|&]*\s+(?:\/|\/\*|~|\$HOME)(?:\s|$)/i, reason: "Recursive force deletion targets a root/home path." },
  { level: "critical", pattern: /\b(?:mkfs(?:\.[a-z0-9]+)?|wipefs)\b/i, reason: "Filesystem formatting/wipe command can destroy disk data." },
  { level: "critical", pattern: /\bdd\b[^\n]*\bof=\/dev\//i, reason: "Raw disk write targets a block device." },
  { level: "critical", pattern: /\bshred\b[^\n]*\/dev\//i, reason: "Secure overwrite targets a block device." },
  { level: "critical", pattern: /\bdrop\s+(?:database|schema)\b/i, reason: "Drops an entire database or schema." },
  { level: "critical", pattern: /\bterraform\s+destroy\b/i, reason: "Destroys managed infrastructure." },
  { level: "critical", pattern: /\bkubectl\s+delete\s+(?:namespace|ns)\b/i, reason: "Deletes a Kubernetes namespace and its resources." },

  { level: "high", pattern: /\brm\s+-[^\n;|&]*r[^\n;|&]*f\b/i, reason: "Recursive force deletion is destructive." },
  { level: "high", pattern: /\bgit\s+reset\s+--hard\b/i, reason: "Discards uncommitted Git changes." },
  { level: "high", pattern: /\bgit\s+clean\s+-[^\n;|&]*f/i, reason: "Deletes untracked Git files." },
  { level: "high", pattern: /\bdocker\s+system\s+prune\b/i, reason: "Deletes unused Docker resources." },
  { level: "high", pattern: /\bdocker\s+volume\s+(?:rm|prune)\b/i, reason: "Deletes Docker volumes and potentially persistent data." },
  { level: "high", pattern: /\bdocker\s+compose\s+down\b[^\n]*(?:\s-v|--volumes)\b/i, reason: "Stops the stack and removes volumes." },
  { level: "high", pattern: /\b(?:drop\s+table|truncate\s+(?:table\s+)?)\b/i, reason: "Deletes database table data." },
  { level: "high", pattern: /\b(?:shutdown|poweroff|halt|reboot)\b/i, reason: "Changes server power state." },
  { level: "high", pattern: /\biptables\s+-F\b/i, reason: "Flushes firewall rules." },
  { level: "high", pattern: /\bufw\s+(?:reset|disable)\b/i, reason: "Resets or disables the firewall." },

  { level: "medium", pattern: /(?:^|[;&|]\s*)sudo\b/i, reason: "Runs with elevated privileges." },
  { level: "medium", pattern: /\bchmod\s+-R\s+777\b/i, reason: "Recursively grants broad filesystem permissions." },
  { level: "medium", pattern: /\bchown\s+-R\b/i, reason: "Recursively changes filesystem ownership." },
  { level: "medium", pattern: /\bkill\s+-9\b/i, reason: "Force-kills a process without graceful cleanup." },
  { level: "medium", pattern: /\bsystemctl\s+(?:stop|disable|mask)\b/i, reason: "Stops or disables a system service." },
  { level: "medium", pattern: /\bdocker\s+(?:rm|rmi)\b/i, reason: "Deletes Docker containers or images." },
];

const rank: Record<CommandRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function classifyCommand(command: string): CommandRisk {
  let level: CommandRiskLevel = "low";
  const reasons: string[] = [];

  for (const rule of rules) {
    if (!rule.pattern.test(command)) continue;
    if (rank[rule.level] > rank[level]) level = rule.level;
    if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
  }

  return { level, reasons };
}

export function riskLabel(level: CommandRiskLevel) {
  return level === "low" ? "Safe" : level[0].toUpperCase() + level.slice(1);
}
