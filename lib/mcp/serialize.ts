import type { McpRow } from "./client";
import { MCP_PRESETS, presetByKind, type McpKind, type McpTransport } from "./presets";

export type McpServerPublic = {
  id: string;
  name: string;
  kind: McpKind | string;
  transport: McpTransport | string;
  command: string | null;
  args: string[];
  url: string | null;
  extra: Record<string, string>;
  enabled: boolean;
  status: string;
  tools: { name: string; description: string }[];
  error: string | null;
  envFields: { key: string; set: boolean }[];
  createdAt: number;
  updatedAt: number;
};

export function mergeEnv(prev: Record<string, string>, patch?: Record<string, string> | null) {
  if (!patch) return prev;
  const next = { ...prev };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") continue;
    if (value.includes("••••") || /^•+$/.test(value)) continue;
    next[key] = String(value);
  }
  return next;
}

export function toPublic(row: McpRow): McpServerPublic {
  const preset = presetByKind(row.kind);
  const keys = new Set([...preset.envFields.map((f) => f.key), ...Object.keys(row.env || {})]);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    transport: row.transport,
    command: row.command,
    args: Array.isArray(row.args) ? row.args : [],
    url: row.url,
    extra: Object.fromEntries(
      Object.entries(row.extra || {}).map(([key, value]) =>
        /^header:/i.test(key) ? [key, value ? "••••" : ""] : [key, value],
      ),
    ),
    enabled: Boolean(row.enabled),
    status: row.status,
    tools: row.tools || [],
    error: row.error,
    envFields: [...keys].filter(Boolean).map((key) => ({ key, set: Boolean(row.env?.[key]) })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export { MCP_PRESETS };
