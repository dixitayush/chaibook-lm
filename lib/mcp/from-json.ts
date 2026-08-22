import type { McpKind, McpTransport } from "./presets";

export type ParsedMcpServer = {
  name: string;
  kind: McpKind;
  transport: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  extra: Record<string, string>;
  warnings: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function strMap(value: unknown): Record<string, string> {
  const rec = asRecord(value);
  if (!rec) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v == null || v === "") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

function parseJsonLoose(raw: string) {
  const trimmed = raw
    .trim()
    .replace(/^```(?:jsonc?|json5?)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!trimmed) throw new Error("Paste a JSON MCP config first.");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const stripped = trimmed
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(stripped) as unknown;
  }
}

function resolveEnvValue(value: string) {
  const envMatch = value.match(/^\$\{(?:env:)?([A-Z][A-Z0-9_]*)\}$/);
  if (envMatch && typeof process !== "undefined" && process.env?.[envMatch[1]]) {
    return process.env[envMatch[1]] as string;
  }
  const wrapped = value.replace(/\$\{env:([A-Z][A-Z0-9_]*)\}/g, (_, key: string) => {
    return (typeof process !== "undefined" && process.env?.[key]) || "";
  });
  return wrapped;
}

function isPlaceholder(value: string) {
  return /\$\{(?:input:|env:)?[^}]+\}/.test(value) || /^<.*>$/.test(value) || /your[-_ ]?(token|key|secret)/i.test(value);
}

function inferKind(name: string, command: string, args: string[], url: string): McpKind {
  const blob = `${name} ${command} ${args.join(" ")} ${url}`.toLowerCase();
  if (/\bgithub\b/.test(blob)) return "github";
  if (/\bjira\b|\batlassian\b/.test(blob)) return "jira";
  if (/\bpostgres(?:ql)?\b|\bpgvector\b/.test(blob)) return "postgres";
  if (/\bnotion\b/.test(blob)) return "notion";
  if (/\bslack\b/.test(blob)) return "slack";
  return "custom";
}

function inferTransport(entry: Record<string, unknown>, command: string, url: string): McpTransport {
  const type = str(entry.type || entry.transport).toLowerCase();
  if (["http", "sse", "streamablehttp", "streamable-http", "streamable_http"].includes(type)) return "http";
  if (type === "stdio") return "stdio";
  if (url && !command) return "http";
  if (url && (type === "remote" || str(entry.url) || str(entry.serverUrl))) return "http";
  return command ? "stdio" : url ? "http" : "stdio";
}

function extractServerMap(root: unknown): { name: string; entry: Record<string, unknown> }[] {
  const rec = asRecord(root);
  if (!rec) {
    if (Array.isArray(root)) {
      return root
        .map((item, i) => {
          const entry = asRecord(item);
          if (!entry) return null;
          return { name: str(entry.name) || `server-${i + 1}`, entry };
        })
        .filter((x): x is { name: string; entry: Record<string, unknown> } => Boolean(x));
    }
    throw new Error("JSON must be an object or an array of MCP servers.");
  }

  const nested =
    asRecord(rec.mcpServers) ||
    asRecord(rec.servers) ||
    asRecord(asRecord(rec.mcp)?.servers) ||
    asRecord(asRecord(rec.mcp)?.mcpServers);

  if (nested) {
    return Object.entries(nested).map(([name, value]) => {
      const entry = asRecord(value);
      if (!entry) throw new Error(`Server “${name}” is not an object.`);
      return { name, entry };
    });
  }

  if (str(rec.command) || str(rec.url) || str(rec.serverUrl) || strList(rec.args).length) {
    return [{ name: str(rec.name) || "imported", entry: rec }];
  }

  const values = Object.entries(rec).filter(([, v]) => asRecord(v) && (str(asRecord(v)!.command) || str(asRecord(v)!.url) || str(asRecord(v)!.serverUrl)));
  if (values.length) {
    return values.map(([name, value]) => ({ name, entry: asRecord(value)! }));
  }

  throw new Error("No MCP servers found. Use mcpServers (Claude) or servers (VS Code / Cursor).");
}

export function parseMcpConfig(raw: string): ParsedMcpServer[] {
  let data: unknown;
  try {
    data = parseJsonLoose(raw);
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error("That JSON is invalid. Paste a Claude, VS Code, or Cursor MCP config.");
    throw err;
  }

  const found = extractServerMap(data);
  if (!found.length) throw new Error("No MCP servers found in that JSON.");
  if (found.length > 12) throw new Error("Import at most 12 servers at a time.");

  return found.map(({ name, entry }) => {
    const warnings: string[] = [];
    const command = str(entry.command);
    const args = strList(entry.args);
    const url = str(entry.url || entry.serverUrl || entry.href);
    const transport = inferTransport(entry, command, url);
    const kind = inferKind(name, command, args, url);
    const env = strMap(entry.env);
    const extra: Record<string, string> = {};
    const headers = strMap(entry.headers);

    for (const [key, value] of Object.entries(env)) {
      const resolved = resolveEnvValue(value);
      if (isPlaceholder(resolved) || !resolved) {
        warnings.push(`Replace ${key} with a real secret (${value})`);
        delete env[key];
      } else {
        env[key] = resolved;
      }
    }

    for (const [key, value] of Object.entries(headers)) {
      const resolved = resolveEnvValue(value);
      if (isPlaceholder(resolved) || !resolved) {
        warnings.push(`Replace header ${key} with a real value`);
        continue;
      }
      extra[`header:${key}`] = resolved;
      if (key.toLowerCase() === "authorization") env.HEADER_AUTHORIZATION = resolved;
    }

    if (str(entry.cwd)) extra.cwd = str(entry.cwd);

    if (transport === "http" && !url) {
      throw new Error(`Server “${name}” is HTTP but has no url.`);
    }
    if (transport === "stdio" && !command) {
      throw new Error(`Server “${name}” is stdio but has no command.`);
    }

    return {
      name: name.slice(0, 80),
      kind,
      transport,
      command: command || null,
      args,
      url: url || null,
      env,
      extra,
      warnings,
    };
  });
}
