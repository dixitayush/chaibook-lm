export type McpKind = "github" | "jira" | "postgres" | "notion" | "slack" | "custom";
export type McpTransport = "stdio" | "http";

export type McpEnvField = {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
};

export type McpPreset = {
  kind: McpKind;
  name: string;
  hint: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  urlPlaceholder?: string;
  envFields: McpEnvField[];
  extraFields?: { key: string; label: string; placeholder?: string }[];
};

export const MCP_PRESETS: McpPreset[] = [
  {
    kind: "github",
    name: "GitHub",
    hint: "Repos, issues, PRs, and file contents",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envFields: [
      { key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "Personal access token", secret: true, placeholder: "ghp_…" },
    ],
    extraFields: [{ key: "repo", label: "Default repo", placeholder: "owner/name" }],
  },
  {
    kind: "jira",
    name: "Jira",
    hint: "Issues, sprints, and project search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@aashari/mcp-server-atlassian-jira"],
    envFields: [
      { key: "ATLASSIAN_SITE_NAME", label: "Site name", placeholder: "your-team (from your-team.atlassian.net)" },
      { key: "ATLASSIAN_USER_EMAIL", label: "Email" },
      { key: "ATLASSIAN_API_TOKEN", label: "API token", secret: true },
    ],
  },
  {
    kind: "postgres",
    name: "Postgres",
    hint: "Read schema and run read-only SQL",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    envFields: [
      { key: "POSTGRES_CONNECTION_STRING", label: "Connection string", secret: true, placeholder: "postgres://user:pass@host:5432/db" },
    ],
  },
  {
    kind: "notion",
    name: "Notion",
    hint: "Pages and databases via the official MCP",
    transport: "http",
    urlPlaceholder: "https://mcp.notion.com/mcp",
    envFields: [{ key: "NOTION_TOKEN", label: "Integration token", secret: true, placeholder: "ntn_…" }],
  },
  {
    kind: "slack",
    name: "Slack",
    hint: "Channels and message search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envFields: [
      { key: "SLACK_BOT_TOKEN", label: "Bot token", secret: true, placeholder: "xoxb-…" },
      { key: "SLACK_TEAM_ID", label: "Team ID", placeholder: "T…" },
    ],
  },
  {
    kind: "custom",
    name: "Custom server",
    hint: "Any stdio command or HTTP MCP URL",
    transport: "stdio",
    envFields: [],
  },
];

export function presetByKind(kind: string) {
  return MCP_PRESETS.find((p) => p.kind === kind) ?? MCP_PRESETS[MCP_PRESETS.length - 1];
}
