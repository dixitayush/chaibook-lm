"use client";

import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  DatabaseIcon,
  GitBranchIcon,
  HashIcon,
  FileCodeIcon,
  Loader2Icon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  TicketIcon,
  Trash2Icon,
  UnplugIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { McpPreset } from "@/lib/mcp/presets";
import type { McpServerPublic } from "@/lib/mcp/serialize";
import { parseMcpConfig } from "@/lib/mcp/from-json";

const KIND_ICON = {
  github: GitBranchIcon,
  jira: TicketIcon,
  postgres: DatabaseIcon,
  notion: BookOpenIcon,
  slack: HashIcon,
  custom: PlugIcon,
} as const;

export function McpPanel({
  notebookId,
  isOwner = true,
  onChange,
}: {
  notebookId: string;
  isOwner?: boolean;
  onChange?: () => void;
}) {
  const [servers, setServers] = useState<McpServerPublic[]>([]);
  const [presets, setPresets] = useState<McpPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonHint, setJsonHint] = useState("");
  const [pullQuery, setPullQuery] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    transport: "stdio",
    command: "",
    args: "",
    url: "",
    env: {} as Record<string, string>,
    extra: {} as Record<string, string>,
  });

  const preset = presets.find((p) => p.kind === kind);

  async function load() {
    try {
      const data = await api<{ servers: McpServerPublic[]; presets: McpPreset[] }>(
        `/api/notebooks/${notebookId}/mcp`,
      );
      setServers(data.servers);
      setPresets(data.presets);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load tools");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [notebookId]);

  async function importJson() {
    setBusy("json");
    try {
      const preview = parseMcpConfig(jsonDraft);
      setJsonHint(
        preview
          .map((s) => `${s.name} (${s.transport}${s.warnings.length ? ` · ${s.warnings.length} warning(s)` : ""})`)
          .join(", "),
      );
      const data = await api<{ servers: McpServerPublic[]; warnings?: string[] }>(`/api/notebooks/${notebookId}/mcp`, {
        method: "POST",
        body: JSON.stringify({ json: jsonDraft }),
      });
      const names = data.servers.map((s) => s.name).join(", ");
      toast.success(data.servers.length === 1 ? `Imported ${names}` : `Imported ${data.servers.length} servers`);
      if (data.warnings?.length) toast.message(data.warnings[0]);
      setKind(null);
      setJsonDraft("");
      setJsonHint("");
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import JSON");
    } finally {
      setBusy(null);
    }
  }

  function pick(next: McpPreset) {
    setKind(next.kind);
    setForm({
      name: next.name,
      transport: next.transport,
      command: next.command || "",
      args: (next.args || []).join(" "),
      url: "",
      env: {},
      extra: {},
    });
  }

  async function connect() {
    if (!kind) return;
    setBusy("connect");
    try {
      const data = await api<{ server: McpServerPublic }>(`/api/notebooks/${notebookId}/mcp`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: form.name,
          transport: form.transport,
          command: form.command || undefined,
          args: form.args,
          url: form.url || undefined,
          env: form.env,
          extra: form.extra,
        }),
      });
      toast.success(
        data.server.status === "connected"
          ? `${data.server.name} connected`
          : `${data.server.name} saved — test the connection`,
      );
      setKind(null);
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy(id);
    try {
      await api(`/api/notebooks/${notebookId}/mcp/${id}/test`, { method: "POST" });
      toast.success("Tools listed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function pull(id: string) {
    setBusy(`pull-${id}`);
    try {
      await api(`/api/notebooks/${notebookId}/mcp/${id}/pull`, {
        method: "POST",
        body: JSON.stringify({ query: pullQuery[id] || undefined }),
      });
      toast.success("Indexed into this notebook");
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(server: McpServerPublic) {
    setBusy(server.id);
    try {
      await api(`/api/notebooks/${notebookId}/mcp/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !server.enabled, probe: false }),
      });
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api(`/api/notebooks/${notebookId}/mcp/${id}`, { method: "DELETE" });
      toast.success("Disconnected");
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium tracking-wide text-chai uppercase">External tools</p>
        <h3 className="font-heading text-lg">MCP servers</h3>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          Connect GitHub, Jira, Postgres, and other MCP servers — from a preset or by pasting Claude / VS Code / Cursor
          JSON. Chat can call them live. Pull snapshots them into the notebook. Stdio (`npx`) works in local `next
          dev`; use an HTTP MCP URL in production.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tools…</p>
      ) : (
        <ul className="space-y-3">
          {servers.map((server) => {
            const Icon = KIND_ICON[server.kind as keyof typeof KIND_ICON] || PlugIcon;
            return (
              <li key={server.id} className="rounded-2xl border border-border bg-card/70 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-8 place-items-center rounded-lg bg-chai/12 text-chai">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{server.name}</p>
                      <Badge variant="outline" className="capitalize">
                        {server.status}
                      </Badge>
                      {!server.enabled && (
                        <Badge variant="outline" className="text-muted-foreground">
                          off
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {server.transport}
                      {server.command ? ` · ${server.command}` : ""}
                      {server.url ? ` · ${server.url}` : ""}
                    </p>
                    {server.error && <p className="mt-1 text-[11px] text-destructive">{server.error}</p>}
                    {server.tools.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {server.tools.slice(0, 8).map((t) => (
                          <span key={t.name} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {t.name}
                          </span>
                        ))}
                        {server.tools.length > 8 && (
                          <span className="text-[10px] text-muted-foreground">+{server.tools.length - 8}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="xs" variant="outline" disabled={busy === server.id} onClick={() => void test(server.id)}>
                        {busy === server.id ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                        Test
                      </Button>
                      {isOwner && (
                        <Button size="xs" variant="outline" disabled={!!busy} onClick={() => void toggle(server)}>
                          {server.enabled ? <UnplugIcon /> : <PlugIcon />}
                          {server.enabled ? "Disable" : "Enable"}
                        </Button>
                      )}
                      {isOwner && (
                        <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => void remove(server.id)}>
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>
                    <form
                      className="mt-2 flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void pull(server.id);
                      }}
                    >
                      <Input
                        placeholder="Pull query (issues, schema, docs…)"
                        value={pullQuery[server.id] || ""}
                        onChange={(e) => setPullQuery((q) => ({ ...q, [server.id]: e.target.value }))}
                      />
                      <Button type="submit" size="xs" disabled={busy === `pull-${server.id}`}>
                        {busy === `pull-${server.id}` ? <Loader2Icon className="animate-spin" /> : null}
                        Pull
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isOwner && !kind && (
        <div>
          <p className="mb-2 text-xs font-medium">Connect a server</p>
          <button
            type="button"
            onClick={() => {
              setKind("json");
              setJsonHint("");
            }}
            className="mb-2 flex w-full items-start gap-2.5 rounded-xl border border-dashed border-chai/40 bg-background p-2.5 text-left transition hover:border-chai/70"
          >
            <FileCodeIcon className="mt-0.5 size-4 text-chai" />
            <span>
              <p className="text-sm font-medium">Paste MCP JSON</p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Claude Code, Claude Desktop, VS Code mcp.json, or Cursor
              </p>
            </span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const Icon = KIND_ICON[p.kind as keyof typeof KIND_ICON] || PlugIcon;
              return (
                <button
                  key={p.kind}
                  type="button"
                  onClick={() => pick(p)}
                  className="rounded-xl border border-border bg-background p-2.5 text-left transition hover:border-chai/45"
                >
                  <Icon className="size-4 text-chai" />
                  <p className="mt-1 text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{p.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isOwner && kind === "json" && (
        <form
          className="space-y-2.5 rounded-2xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void importJson();
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Import JSON</p>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setKind(null);
                setJsonDraft("");
                setJsonHint("");
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Accepts <code className="text-[10px]">mcpServers</code> (Claude) or <code className="text-[10px]">servers</code>{" "}
            (VS Code / Cursor), including HTTP <code className="text-[10px]">url</code> +{" "}
            <code className="text-[10px]">headers</code>. Comments and trailing commas are fine.
          </p>
          <Textarea
            className="min-h-44 font-mono text-[11px] leading-4"
            spellCheck={false}
            placeholder={`{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_…"
      }
    }
  }
}`}
            value={jsonDraft}
            onChange={(e) => {
              setJsonDraft(e.target.value);
              try {
                const preview = parseMcpConfig(e.target.value);
                setJsonHint(preview.map((s) => `${s.name} · ${s.transport}`).join(" · "));
              } catch (err) {
                setJsonHint(e.target.value.trim() ? (err instanceof Error ? err.message : "Invalid JSON") : "");
              }
            }}
          />
          {jsonHint && <p className="text-[11px] text-muted-foreground">{jsonHint}</p>}
          <Button type="submit" className="w-full" disabled={busy === "json" || !jsonDraft.trim()}>
            {busy === "json" ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            Import
          </Button>
        </form>
      )}

      {isOwner && preset && (
        <form
          className="space-y-2.5 rounded-2xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Connect {preset.name}</p>
            <Button type="button" size="xs" variant="ghost" onClick={() => setKind(null)}>
              Cancel
            </Button>
          </div>
          <Input placeholder="Display name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          {preset.kind === "custom" && (
            <>
              <div className="flex gap-1 rounded-lg bg-muted p-0.5">
                {(["stdio", "http"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, transport: t }))}
                    className={
                      form.transport === t
                        ? "flex-1 rounded-md bg-background px-2 py-1 text-xs font-medium"
                        : "flex-1 px-2 py-1 text-xs text-muted-foreground"
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              {form.transport === "stdio" ? (
                <>
                  <Input
                    placeholder="Command (npx)"
                    value={form.command}
                    onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                  />
                  <Input
                    placeholder="Args (-y @scope/mcp-server)"
                    value={form.args}
                    onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
                  />
                </>
              ) : (
                <Input
                  placeholder={preset.urlPlaceholder || "https://…/mcp"}
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              )}
            </>
          )}
          {preset.kind !== "custom" && preset.transport === "http" && (
            <Input
              placeholder={preset.urlPlaceholder || "MCP URL"}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          )}
          {preset.envFields.map((field) => (
            <Input
              key={field.key}
              type={field.secret ? "password" : "text"}
              autoComplete="off"
              placeholder={field.placeholder || field.label}
              value={form.env[field.key] || ""}
              onChange={(e) => setForm((f) => ({ ...f, env: { ...f.env, [field.key]: e.target.value } }))}
            />
          ))}
          {(preset.extraFields || []).map((field) => (
            <Input
              key={field.key}
              placeholder={field.placeholder || field.label}
              value={form.extra[field.key] || ""}
              onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, [field.key]: e.target.value } }))}
            />
          ))}
          <Button type="submit" className="w-full" disabled={busy === "connect"}>
            {busy === "connect" ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            Connect
          </Button>
        </form>
      )}

      {!isOwner && (
        <p className="text-[11px] text-muted-foreground">Only the notebook owner can add or edit tool secrets.</p>
      )}
    </div>
  );
}
