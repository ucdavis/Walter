#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/../main.bicep"

usage() {
  cat <<'EOF'
Usage:
  infrastructure/azure/scripts/deploy.sh --resource-group <name> --app-service-plan-id <id> --sql-admin-login <login> --datamart-connection-string <connection> [options]

Required:
  -g, --resource-group           Azure resource group name to deploy into
      --app-service-plan-id      Existing App Service Plan resource ID
      --sql-admin-login          SQL admin login name
      --datamart-connection-string  Datamart connection string (or set env var DM_CONNECTION)

SQL password:
      --sql-admin-password       SQL admin password (or set env var SQL_ADMIN_PASSWORD)

Naming:
      --app-name                 Application name used for generated names (default: walter)
      --env                      Environment name used for generated names (ex: test, production)

Other:
  -l, --location                 Location used if resource group must be created (default: westus2)
      --linux-fx-version         App Service runtime stack (default: DOTNETCORE|8.0)
      --function-linux-fx-version  Azure Functions runtime stack (default: DOTNET-ISOLATED|8.0)
      --allow-azure-services-to-sql  Adds SQL firewall rule AllowAzureServices (0.0.0.0)
      --what-if                  Run in what-if mode (no changes)
  -h, --help                     Show help

Examples:
  SQL_ADMIN_PASSWORD='...' infrastructure/azure/scripts/deploy.sh \\
    -g walter-test --app-name walter --env test \\
    --app-service-plan-id "/subscriptions/.../serverfarms/DefaultPlan2" \\
    --sql-admin-login walter \\
    --datamart-connection-string "$DM_CONNECTION"

  infrastructure/azure/scripts/deploy.sh \\
    -g walter --app-name walter --env production \\
    --app-service-plan-id "/subscriptions/.../serverfarms/DefaultPlan2" \\
    --sql-admin-login walter \\
    --sql-admin-password '...' \\
    --datamart-connection-string "Server=tcp:<server>.database.windows.net,1433;Database=<database>;User ID=<user>;Password=<password>;Encrypt=True;TrustServerCertificate=False;"
EOF
}

RESOURCE_GROUP=""
LOCATION=""
ENVIRONMENT=""
APP_NAME="walter"

APP_SERVICE_PLAN_ID="${APP_SERVICE_PLAN_ID:-}"
SQL_ADMIN_LOGIN_VALUE="${SQL_ADMIN_LOGIN:-}"
SQL_ADMIN_PASSWORD_VALUE="${SQL_ADMIN_PASSWORD:-}"
DATAMART_CONNECTION_STRING_VALUE="${DM_CONNECTION:-}"

LINUX_FX_VERSION="DOTNETCORE|8.0"
FUNCTION_LINUX_FX_VERSION="DOTNET-ISOLATED|8.0"
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
    --app-name|--name-prefix)
      APP_NAME="${2:-}"; shift 2 ;;
    --app-service-plan-id)
      APP_SERVICE_PLAN_ID="${2:-}"; shift 2 ;;
    --sql-admin-login)
      SQL_ADMIN_LOGIN_VALUE="${2:-}"; shift 2 ;;
    --sql-admin-password)
      SQL_ADMIN_PASSWORD_VALUE="${2:-}"; shift 2 ;;
    --datamart-connection-string)
      DATAMART_CONNECTION_STRING_VALUE="${2:-}"; shift 2 ;;
    --linux-fx-version)
      LINUX_FX_VERSION="${2:-}"; shift 2 ;;
    --function-linux-fx-version)
      FUNCTION_LINUX_FX_VERSION="${2:-}"; shift 2 ;;
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

if [[ -z "$DATAMART_CONNECTION_STRING_VALUE" ]]; then
  echo "Missing required: --datamart-connection-string (or set DM_CONNECTION)" >&2
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

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI not found. Install it first: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

normalize_name() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[ _]/-/g'
}

app_setting_exists() {
  local app_type="$1"
  local app_name="$2"
  local setting_name="$3"
  local count

  if [[ "$app_type" == "webapp" ]]; then
    count="$(az webapp config appsettings list \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --query "[?name=='${setting_name}'] | length(@)" \
      -o tsv)"
  else
    count="$(az functionapp config appsettings list \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --query "[?name=='${setting_name}'] | length(@)" \
      -o tsv)"
  fi

  [[ "$count" != "0" ]]
}

seed_app_setting_if_missing() {
  local app_type="$1"
  local app_name="$2"
  local setting_name="$3"
  local setting_value="$4"

  if app_setting_exists "$app_type" "$app_name" "$setting_name"; then
    echo "Preserving existing app setting '${setting_name}' on '${app_name}'."
    return
  fi

  echo "Adding missing app setting '${setting_name}' to '${app_name}'."
  if [[ "$app_type" == "webapp" ]]; then
    az webapp config appsettings set \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --settings "${setting_name}=${setting_value}" \
      >/dev/null
  else
    az functionapp config appsettings set \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --settings "${setting_name}=${setting_value}" \
      >/dev/null
  fi
}

if [[ "$(az group exists -n "$RESOURCE_GROUP")" != "true" ]]; then
  LOCATION="${LOCATION:-westus2}"
  echo "Creating resource group '${RESOURCE_GROUP}' in '${LOCATION}'..."
  az group create -n "$RESOURCE_GROUP" -l "$LOCATION" >/dev/null
else
  if [[ -z "$LOCATION" ]]; then
    LOCATION="$(az group show -n "$RESOURCE_GROUP" --query location -o tsv)"
  fi
fi

DEPLOYMENT_NAME="walter-${APP_NAME}${ENVIRONMENT:+-${ENVIRONMENT}}-$(date -u +%Y%m%d%H%M%S)"

AZ_PARAMS=(
  "location=${LOCATION}"
  "appName=${APP_NAME}"
  "appServicePlanId=${APP_SERVICE_PLAN_ID}"
  "sqlAdminLogin=${SQL_ADMIN_LOGIN_VALUE}"
  "sqlAdminPassword=${SQL_ADMIN_PASSWORD_VALUE}"
  "linuxFxVersion=${LINUX_FX_VERSION}"
  "functionLinuxFxVersion=${FUNCTION_LINUX_FX_VERSION}"
  "allowAzureServicesToSql=${ALLOW_AZURE_SERVICES_TO_SQL}"
)

if [[ -n "$ENVIRONMENT" ]]; then
  AZ_PARAMS+=("env=${ENVIRONMENT}")
fi

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

  WEB_APP_NAME="$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.webAppName.value" \
    -o tsv)"
  FUNCTION_APP_NAME="$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.functionAppName.value" \
    -o tsv)"
  FUNCTION_STORAGE_ACCOUNT_NAME="$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.functionStorageAccountName.value" \
    -o tsv)"
  SQL_SERVER_FQDN="$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.sqlServerFqdn.value" \
    -o tsv)"
  SQL_DB_NAME="$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.sqlDbName.value" \
    -o tsv)"

  NORMALIZED_ENV="$(normalize_name "$ENVIRONMENT")"
  if [[ -z "$NORMALIZED_ENV" ]]; then
    DATAMART_WEB_APP_NAME="Walter-Production"
    DATAMART_FUNCTION_APP_NAME="Walter-Notifications-Production"
    RUM_ENVIRONMENT="production"
  else
    DATAMART_WEB_APP_NAME="Walter-${NORMALIZED_ENV}"
    DATAMART_FUNCTION_APP_NAME="Walter-Notifications-${NORMALIZED_ENV}"
    RUM_ENVIRONMENT="$NORMALIZED_ENV"
  fi

  DB_CONNECTION_VALUE="Server=tcp:${SQL_SERVER_FQDN},1433;Initial Catalog=${SQL_DB_NAME};Persist Security Info=False;User ID=${SQL_ADMIN_LOGIN_VALUE};Password=${SQL_ADMIN_PASSWORD_VALUE};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
  FUNCTION_STORAGE_CONNECTION="$(az storage account show-connection-string \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_STORAGE_ACCOUNT_NAME" \
    --query connectionString \
    -o tsv)"

  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "DB_CONNECTION" "$DB_CONNECTION_VALUE"
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "DM_CONNECTION" "$DATAMART_CONNECTION_STRING_VALUE"
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Datamart__ApplicationName" "$DATAMART_WEB_APP_NAME"
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Rum__Enabled" "false"
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Rum__Environment" "$RUM_ENVIRONMENT"
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Rum__ServerUrl" ""
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Rum__ServiceName" "walter-web"
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Rum__ServiceVersion" ""
  seed_app_setting_if_missing "webapp" "$WEB_APP_NAME" "Rum__TransactionSampleRate" "0.2"

  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "AzureWebJobsStorage" "$FUNCTION_STORAGE_CONNECTION"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "FUNCTIONS_EXTENSION_VERSION" "~4"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "FUNCTIONS_WORKER_RUNTIME" "dotnet-isolated"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "DB_CONNECTION" "$DB_CONNECTION_VALUE"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "DM_CONNECTION" "$DATAMART_CONNECTION_STRING_VALUE"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "Datamart__ApplicationName" "$DATAMART_FUNCTION_APP_NAME"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "NOTIFICATIONS_SENDER_SCHEDULE" "0 */15 * * * *"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE" "0 0 9 1 * *"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "Notifications__SenderEnabled" "false"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "Notifications__AccrualGenerationEnabled" "false"
fi
