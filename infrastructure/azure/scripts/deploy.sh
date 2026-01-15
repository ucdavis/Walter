#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/../infrastructure/azure/main.bicep"

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy.sh --resource-group <name> --app-service-plan-id <id> --sql-admin-login <login> [options]

Required:
  -g, --resource-group           Azure resource group name to deploy into
      --app-service-plan-id      Existing App Service Plan resource ID
      --sql-admin-login          SQL admin login name

SQL password:
      --sql-admin-password       SQL admin password (or set env var SQL_ADMIN_PASSWORD)

Naming:
      --env                      Environment name (ex: test, production)
      --name-prefix              Base name used to derive resource names (default: walter)
      --web-app-name             Override web app name (default: <name-prefix>-<env> or <name-prefix>)
      --sql-server-name          Override SQL server name (default: <name-prefix>-<env> or <name-prefix>)
      --sql-db-name              Override SQL database name (default: <name-prefix>-<env> or <name-prefix>)

Other:
  -l, --location                 Location used if resource group must be created (default: westus2)
      --linux-fx-version         App Service runtime stack (default: DOTNETCORE|8.0)
      --allow-azure-services-to-sql  Adds SQL firewall rule AllowAzureServices (0.0.0.0)
      --what-if                  Run in what-if mode (no changes)
  -h, --help                     Show help

Examples:
  SQL_ADMIN_PASSWORD='...' scripts/deploy.sh \\
    -g walter-test --env test \\
    --app-service-plan-id "/subscriptions/.../serverfarms/DefaultPlan2" \\
    --sql-admin-login walter

  scripts/deploy.sh \\
    -g walter --env production \\
    --app-service-plan-id "/subscriptions/.../serverfarms/DefaultPlan2" \\
    --sql-admin-login walter \\
    --sql-admin-password '...'
EOF
}

RESOURCE_GROUP=""
LOCATION=""
ENVIRONMENT=""
NAME_PREFIX="walter"

WEB_APP_NAME=""
SQL_SERVER_NAME=""
SQL_DB_NAME=""

APP_SERVICE_PLAN_ID="${APP_SERVICE_PLAN_ID:-}"
SQL_ADMIN_LOGIN_VALUE="${SQL_ADMIN_LOGIN:-}"
SQL_ADMIN_PASSWORD_VALUE="${SQL_ADMIN_PASSWORD:-}"

LINUX_FX_VERSION="DOTNETCORE|8.0"
ALLOW_AZURE_SERVICES_TO_SQL="false"
WHAT_IF="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -g|--resource-group)
      RESOURCE_GROUP="${2:-}"; shift 2 ;;
    -l|--location)
      LOCATION="${2:-}"; shift 2 ;;
    --env)
      ENVIRONMENT="${2:-}"; shift 2 ;;
    --name-prefix)
      NAME_PREFIX="${2:-}"; shift 2 ;;
    --web-app-name)
      WEB_APP_NAME="${2:-}"; shift 2 ;;
    --sql-server-name)
      SQL_SERVER_NAME="${2:-}"; shift 2 ;;
    --sql-db-name)
      SQL_DB_NAME="${2:-}"; shift 2 ;;
    --app-service-plan-id)
      APP_SERVICE_PLAN_ID="${2:-}"; shift 2 ;;
    --sql-admin-login)
      SQL_ADMIN_LOGIN_VALUE="${2:-}"; shift 2 ;;
    --sql-admin-password)
      SQL_ADMIN_PASSWORD_VALUE="${2:-}"; shift 2 ;;
    --linux-fx-version)
      LINUX_FX_VERSION="${2:-}"; shift 2 ;;
    --allow-azure-services-to-sql)
      ALLOW_AZURE_SERVICES_TO_SQL="true"; shift ;;
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

if [[ -z "$APP_SERVICE_PLAN_ID" ]]; then
  echo "Missing required: --app-service-plan-id" >&2
  usage
  exit 2
fi

if [[ -z "$SQL_ADMIN_LOGIN_VALUE" ]]; then
  echo "Missing required: --sql-admin-login" >&2
  usage
  exit 2
fi

if [[ -z "$SQL_ADMIN_PASSWORD_VALUE" ]]; then
  read -r -s -p "SQL admin password: " SQL_ADMIN_PASSWORD_VALUE
  echo
fi

if [[ -z "$SQL_ADMIN_PASSWORD_VALUE" ]]; then
  echo "Missing required SQL password (pass --sql-admin-password or set SQL_ADMIN_PASSWORD)" >&2
  exit 2
fi

suffix=""
if [[ -n "$ENVIRONMENT" ]]; then
  case "$ENVIRONMENT" in
    prod|production)
      suffix="" ;;
    *)
      suffix="-${ENVIRONMENT}" ;;
  esac
fi

default_name="${NAME_PREFIX}${suffix}"
WEB_APP_NAME="${WEB_APP_NAME:-$default_name}"
SQL_SERVER_NAME="${SQL_SERVER_NAME:-$default_name}"
SQL_DB_NAME="${SQL_DB_NAME:-$default_name}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI not found. Install it first: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if [[ "$(az group exists -n "$RESOURCE_GROUP")" != "true" ]]; then
  LOCATION="${LOCATION:-westus2}"
  echo "Creating resource group '${RESOURCE_GROUP}' in '${LOCATION}'..."
  az group create -n "$RESOURCE_GROUP" -l "$LOCATION" >/dev/null
else
  if [[ -z "$LOCATION" ]]; then
    LOCATION="$(az group show -n "$RESOURCE_GROUP" --query location -o tsv)"
  fi
fi

DEPLOYMENT_NAME="${WEB_APP_NAME}-$(date -u +%Y%m%d%H%M%S)"

AZ_PARAMS=(
  "location=${LOCATION}"
  "webAppName=${WEB_APP_NAME}"
  "appServicePlanId=${APP_SERVICE_PLAN_ID}"
  "sqlServerName=${SQL_SERVER_NAME}"
  "sqlDbName=${SQL_DB_NAME}"
  "sqlAdminLogin=${SQL_ADMIN_LOGIN_VALUE}"
  "sqlAdminPassword=${SQL_ADMIN_PASSWORD_VALUE}"
  "linuxFxVersion=${LINUX_FX_VERSION}"
  "allowAzureServicesToSql=${ALLOW_AZURE_SERVICES_TO_SQL}"
)

if [[ "$WHAT_IF" == "true" ]]; then
  az deployment group what-if \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "${AZ_PARAMS[@]}"
else
  az deployment group create \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "${AZ_PARAMS[@]}"
fi
