#!/usr/bin/env bash
# Deploy Chaibook LM behind the Traefik gateway (private Caddy + app + db + redis).
# Prerequisite: repo-root ./setup.sh (Docker + Traefik) already ran.
# Usage:
#   ./deploy.sh
#   CHAIBOOK_HOST=chaibook.ayushdixit.work APP_URL=https://chaibook.ayushdixit.work \\
#     OPENAI_API_KEY=sk-... POSTGRES_PASSWORD=... ./deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  die "Docker is not reachable. Run ../setup.sh on the VPS first."
fi

compose() { "${DOCKER[@]}" compose "$@"; }

prompt() {
  local var="$1" message="$2" default="${3:-}"
  local current=""
  eval "current=\"\${${var}-}\""
  if [[ -n "$current" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    return 1
  fi
  local reply
  if [[ -n "$default" ]]; then
    read -r -p "$message [$default]: " reply || true
    printf -v "$var" '%s' "${reply:-$default}"
  else
    read -r -p "$message: " reply || true
    printf -v "$var" '%s' "$reply"
  fi
}

env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | tail -1 | cut -d= -f2- || true
}

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  KEY="$key" VAL="$value" awk '
    BEGIN { k=ENVIRON["KEY"]; v=ENVIRON["VAL"]; done=0 }
    $0 ~ "^#?" k "=" { if (!done) { print k "=" v; done=1 } next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$tmp"
  mv "$tmp" "$file"
}

if [[ ! -f .env ]]; then
  [[ -f .env.example ]] || die "Missing .env.example."
  cp .env.example .env
  log "Created .env from .env.example."
fi

CHAIBOOK_HOST="${CHAIBOOK_HOST:-$(env_get .env CHAIBOOK_HOST)}"
APP_URL="${APP_URL:-$(env_get .env APP_URL)}"
MAIL_FROM="${MAIL_FROM:-$(env_get .env MAIL_FROM)}"
OPENAI_API_KEY="${OPENAI_API_KEY:-$(env_get .env OPENAI_API_KEY)}"
GEMINI_API_KEY="${GEMINI_API_KEY:-$(env_get .env GEMINI_API_KEY)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(env_get .env POSTGRES_PASSWORD)}"
AUTH_SECRET="${AUTH_SECRET:-$(env_get .env AUTH_SECRET)}"

# Local-dev APP_URL in the example is http://localhost — treat that as unset on VPS.
if [[ "${APP_URL:-}" == http://localhost* ]]; then
  APP_URL=""
fi

prompt CHAIBOOK_HOST "Public hostname" "chaibook.ayushdixit.work" || true
if [[ -z "${APP_URL:-}" && -n "${CHAIBOOK_HOST:-}" ]]; then
  APP_URL="https://${CHAIBOOK_HOST}"
fi
prompt APP_URL "Public https URL" "${APP_URL:-https://chaibook.ayushdixit.work}" || true

if [[ -z "${OPENAI_API_KEY:-}" && -z "${GEMINI_API_KEY:-}" ]]; then
  prompt OPENAI_API_KEY "OPENAI_API_KEY (blank to use Gemini instead)" || true
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    prompt GEMINI_API_KEY "GEMINI_API_KEY" || true
  fi
fi

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  if [[ -t 0 ]]; then
    prompt POSTGRES_PASSWORD "Postgres password (blank = generate)" || true
  fi
  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    if command -v openssl >/dev/null; then
      POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -d '\n=/+' | head -c 24)"
    else
      POSTGRES_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"
    fi
    log "Generated POSTGRES_PASSWORD and wrote it to .env."
  fi
fi

if [[ -z "${AUTH_SECRET:-}" || "${#AUTH_SECRET}" -lt 32 ]]; then
  if command -v openssl >/dev/null; then
    AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  else
    AUTH_SECRET="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)"
  fi
  log "Generated AUTH_SECRET and wrote it to .env."
fi

[[ -n "${CHAIBOOK_HOST:-}" ]] || die "Set CHAIBOOK_HOST (e.g. chaibook.ayushdixit.work)."
[[ "${APP_URL:-}" == https://* ]] || die "Set APP_URL to the public https URL."
[[ -n "${OPENAI_API_KEY:-}" || -n "${GEMINI_API_KEY:-}" ]] || \
  die "Set OPENAI_API_KEY or GEMINI_API_KEY in .env."
[[ -n "${POSTGRES_PASSWORD:-}" ]] || die "Set POSTGRES_PASSWORD."

if [[ -z "${MAIL_FROM:-}" || "$MAIL_FROM" == *"@example.com"* ]]; then
  MAIL_FROM="ChaiBook LM <hello@${CHAIBOOK_HOST}>"
fi

upsert_env .env CHAIBOOK_HOST "$CHAIBOOK_HOST"
upsert_env .env APP_URL "$APP_URL"
upsert_env .env MAIL_FROM "$MAIL_FROM"
upsert_env .env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
upsert_env .env AUTH_SECRET "$AUTH_SECRET"
[[ -n "${OPENAI_API_KEY:-}" ]] && upsert_env .env OPENAI_API_KEY "$OPENAI_API_KEY"
[[ -n "${GEMINI_API_KEY:-}" ]] && upsert_env .env GEMINI_API_KEY "$GEMINI_API_KEY"

if ! "${DOCKER[@]}" network inspect proxy >/dev/null 2>&1; then
  die "Docker network 'proxy' is missing. From the repo root run: ./setup.sh"
fi

if ! "${DOCKER[@]}" ps --filter "label=com.docker.compose.project=gateway" \
      --filter "label=com.docker.compose.service=traefik" \
      --filter "status=running" --format '{{.Names}}' | grep -q .; then
  die "Traefik is not running. From the repo root run: ./setup.sh"
fi

log "Building and starting Chaibook (this can take several minutes the first time)."
compose -f docker-compose.prod.yml --env-file .env up -d --build

log "Chaibook is up on the private network."
echo "Public URL: $APP_URL"
echo "Traefik routes Host($CHAIBOOK_HOST) → Caddy → app."
echo "Health: $APP_URL/api/health"
