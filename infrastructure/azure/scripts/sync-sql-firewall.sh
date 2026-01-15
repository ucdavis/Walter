#!/bin/bash
set -euo pipefail

usage() {
  cat <<'EOF'
Sync App Service outbound IPs into Azure SQL firewall rules.

This script is idempotent:
  - Upserts rules for all outbound + possible outbound IPs of the web app
  - Removes stale rules previously created by this script

Usage:
  scripts/sync-sql-firewall.sh -g <resource-group> --app-name <name> [--env <env>] [options]

Required:
  -g, --resource-group     Resource group containing the web app + SQL server
      --app-name           Application name used for generated resource names (ex: walter)

Optional:
      --env                Environment name (ex: test, production). If omitted, uses empty env.
      --web-app-name       Explicit web app name (skips discovery)
      --sql-server-name    Explicit SQL server name (skips discovery)
      --current-only       Only use current outbound IPs (skip possible outbound IPs)
      --what-if            Print actions without making changes
  -h, --help               Show help

Discovery (when names are not provided):
  - Web app: starts with "web-<app>-<env>-"
  - SQL server: starts with "sql-<app>-<env>-"

Firewall rules managed by this script are named:
  "appsvc-<web-app-name>-<ip-with-dashes>"
EOF
}

RESOURCE_GROUP=""
APP_NAME=""
ENVIRONMENT=""
WEB_APP_NAME=""
SQL_SERVER_NAME=""
CURRENT_ONLY="false"
WHAT_IF="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -g|--resource-group)
      RESOURCE_GROUP="${2:-}"; shift 2 ;;
    --app-name)
      APP_NAME="${2:-}"; shift 2 ;;
    --env)
      ENVIRONMENT="${2:-}"; shift 2 ;;
    --web-app-name)
      WEB_APP_NAME="${2:-}"; shift 2 ;;
    --sql-server-name)
      SQL_SERVER_NAME="${2:-}"; shift 2 ;;
    --current-only)
      CURRENT_ONLY="true"; shift ;;
    --what-if)
      WHAT_IF="true"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2 ;;
  esac
done

if [[ -z "$RESOURCE_GROUP" ]]; then
  echo "Missing required: --resource-group" >&2
  usage
  exit 2
fi

if [[ -z "$APP_NAME" && -z "$WEB_APP_NAME" ]]; then
  echo "Missing required: --app-name (or provide --web-app-name and --sql-server-name)" >&2
  usage
  exit 2
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI not found. Install it first: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if ! az account show >/dev/null 2>&1; then
  echo "Not logged into Azure CLI. Run: az login" >&2
  exit 1
fi

normalize() {
  # lower, replace spaces/underscores with hyphens
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -e 's/[ _]/-/g'
}

normalized_app="$(normalize "$APP_NAME")"
normalized_env="$(normalize "$ENVIRONMENT")"

base_name="$normalized_app"
if [[ -n "$normalized_env" ]]; then
  base_name="${normalized_app}-${normalized_env}"
fi

web_prefix="web-${base_name}-"
sql_prefix="sql-${base_name}-"

discover_single_name() {
  local kind="$1"
  local query="$2"
  local result
  local count

  # shellcheck disable=SC2086
  result="$(az $kind list --resource-group "$RESOURCE_GROUP" --query "$query" -o tsv | sed '/^$/d' || true)"
  count="$(echo "$result" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$count" -eq 1 ]]; then
    echo "$result"
    return 0
  fi

  if [[ "$count" -eq 0 ]]; then
    echo "" >&2
    echo "No matching resource found for ${kind} in resource group '${RESOURCE_GROUP}'." >&2
    echo "Expected name prefix: ${3}" >&2
    echo "Tip: pass explicit --web-app-name/--sql-server-name to skip discovery." >&2
    return 1
  fi

  echo "" >&2
  echo "Multiple matching resources found for ${kind} in resource group '${RESOURCE_GROUP}'." >&2
  echo "Matches:" >&2
  echo "$result" | sed 's/^/  - /' >&2
  echo "Tip: pass explicit --web-app-name/--sql-server-name to disambiguate." >&2
  return 1
}

if [[ -z "$WEB_APP_NAME" ]]; then
  WEB_APP_NAME="$(discover_single_name "webapp" "[?starts_with(name, '${web_prefix}')].name" "$web_prefix")"
fi

if [[ -z "$SQL_SERVER_NAME" ]]; then
  SQL_SERVER_NAME="$(discover_single_name "sql server" "[?starts_with(name, '${sql_prefix}')].name" "$sql_prefix")"
fi

if [[ -z "$WEB_APP_NAME" || -z "$SQL_SERVER_NAME" ]]; then
  exit 1
fi

if [[ "$CURRENT_ONLY" == "true" ]]; then
  ips_raw="$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --query 'outboundIpAddresses' -o tsv)"
else
  ips_raw="$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --query \"join(',', [outboundIpAddresses, possibleOutboundIpAddresses])\" -o tsv)"
fi

ips=()
while IFS= read -r ip; do
  ip="$(echo "$ip" | sed -e 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -n "$ip" ]] && ips+=("$ip")
done < <(echo "$ips_raw" | tr ',' '\n' | sort -u)

if [[ "${#ips[@]}" -eq 0 ]]; then
  echo "No outbound IPs found for web app '${WEB_APP_NAME}'." >&2
  exit 1
fi

rule_prefix="appsvc-${WEB_APP_NAME}-"

desired_rules=()
for ip in "${ips[@]}"; do
  desired_rules+=("${rule_prefix}${ip//./-}")
done

contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

echo "Web app: ${WEB_APP_NAME}"
echo "SQL server: ${SQL_SERVER_NAME}"
echo "IPs (${#ips[@]}):"
for ip in "${ips[@]}"; do
  echo "  - ${ip}"
done

# Upsert desired rules (create/update)
for i in "${!ips[@]}"; do
  ip="${ips[$i]}"
  rule_name="${desired_rules[$i]}"

  if [[ "$WHAT_IF" == "true" ]]; then
    echo "[what-if] upsert firewall rule '${rule_name}' -> ${ip}"
  else
    az sql server firewall-rule create \
      --resource-group "$RESOURCE_GROUP" \
      --server "$SQL_SERVER_NAME" \
      --name "$rule_name" \
      --start-ip-address "$ip" \
      --end-ip-address "$ip" \
      >/dev/null
  fi
done

# Remove stale rules previously created by this script (same prefix)
existing_rules_raw="$(az sql server firewall-rule list \
  --resource-group "$RESOURCE_GROUP" \
  --server "$SQL_SERVER_NAME" \
  --query \"[?starts_with(name, '${rule_prefix}')].name\" \
  -o tsv || true)"

existing_rules=()
while IFS= read -r r; do
  [[ -n "$r" ]] && existing_rules+=("$r")
done < <(echo "$existing_rules_raw" | sed '/^$/d')

for rule_name in "${existing_rules[@]}"; do
  if ! contains "$rule_name" "${desired_rules[@]}"; then
    if [[ "$WHAT_IF" == "true" ]]; then
      echo "[what-if] delete stale firewall rule '${rule_name}'"
    else
      az sql server firewall-rule delete \
        --resource-group "$RESOURCE_GROUP" \
        --server "$SQL_SERVER_NAME" \
        --name "$rule_name" \
        --yes \
        >/dev/null
    fi
  fi
done

if [[ "$WHAT_IF" == "true" ]]; then
  echo "[what-if] done"
else
  echo "Done"
fi
