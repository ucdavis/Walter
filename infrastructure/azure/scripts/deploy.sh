#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/../main.bicep"

usage() {
  cat <<'EOF'
Usage:
  infrastructure/azure/scripts/deploy.sh --config <file.json> [options]
  infrastructure/azure/scripts/deploy.sh --resource-group <name> --app-service-plan-id <id> [options]

Configuration:
      --config                   JSON deployment defaults; command-line options override them (requires jq)
      --subscription             Deployment subscription ID (required in config; otherwise defaults to current subscription)

Required:
  -g, --resource-group           Azure resource group name to deploy into
      --app-service-plan-id      Existing App Service Plan resource ID

SQL creation:
      --sql-admin-login          SQL admin login name (required only when creating a new SQL server)
      --sql-admin-password       SQL admin password (required only when creating a new SQL server, or when seeding a missing DB_CONNECTION for an existing server)

App setting seeds:
      --datamart-connection-string  Datamart connection string (required only when seeding a missing DM_CONNECTION, or set env var DM_CONNECTION)

App Configuration (opt-in, existing store only):
      --app-configuration-store-name       Existing store name
      --app-configuration-resource-group   Resource group containing the store (required with store name)
      --app-configuration-subscription-id  Store subscription ID (default: deployment subscription)
      --runtime-environment                Exact feature flag label: Test or Production (required with store name)
      --app-configuration-access-only      Provision identity/access without setting endpoint or runtime environment

Naming:
      --app-name                 Application name used for generated names (default: walter)
      --env                      Environment name used for generated names (ex: test, production)

Other:
  -l, --location                 Location used if resource group must be created (default: westus2)
      --linux-fx-version         App Service runtime stack (default: DOTNETCORE|10.0)
      --function-linux-fx-version  Azure Functions runtime stack (default: DOTNET-ISOLATED|10.0)
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

  infrastructure/azure/scripts/deploy.sh \\
    -g walter-test --app-name walter --env test \\
    --app-service-plan-id "/subscriptions/.../serverfarms/DefaultPlan2"
EOF
}

RESOURCE_GROUP=""
LOCATION=""
ENVIRONMENT=""
APP_NAME="walter"
TARGET_SUBSCRIPTION=""

APP_SERVICE_PLAN_ID="${APP_SERVICE_PLAN_ID:-}"
SQL_ADMIN_LOGIN_VALUE="${SQL_ADMIN_LOGIN:-}"
SQL_ADMIN_PASSWORD_VALUE="${SQL_ADMIN_PASSWORD:-}"
DATAMART_CONNECTION_STRING_VALUE="${DM_CONNECTION:-}"

LINUX_FX_VERSION="DOTNETCORE|10.0"
FUNCTION_LINUX_FX_VERSION="DOTNET-ISOLATED|10.0"
ALLOW_AZURE_SERVICES_TO_SQL="false"
WHAT_IF="false"
CREATE_SQL_SERVER="true"
SQL_SERVER_NAME_OVERRIDE=""
APP_CONFIGURATION_STORE_NAME=""
APP_CONFIGURATION_RESOURCE_GROUP=""
APP_CONFIGURATION_SUBSCRIPTION_ID=""
RUNTIME_ENVIRONMENT=""
APP_CONFIGURATION_ACCESS_ONLY="false"

# Load data as arguments, never as shell code. Prepend defaults so explicit CLI options win.
CONFIG_FILE=""
CLI_ARGS=()
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--config" ]]; then
    if [[ -n "$CONFIG_FILE" || $# -lt 2 || -z "${2:-}" ]]; then
      echo "Pass --config once with a JSON file path." >&2
      exit 2
    fi
    CONFIG_FILE="$2"
    shift 2
  else
    CLI_ARGS+=("$1")
    shift
  fi
done

CONFIG_ARGS=()
if [[ -n "$CONFIG_FILE" ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to read --config JSON files." >&2
    exit 1
  fi
  CONFIG_ARGUMENTS="$(jq -er '
    if type == "object"
      and (keys - ["subscription", "resource-group", "location", "app-name", "env", "app-service-plan-id",
        "app-configuration-store-name", "app-configuration-resource-group", "app-configuration-subscription-id",
        "runtime-environment", "linux-fx-version", "function-linux-fx-version"] | length == 0)
      and all(.[]; type == "string" and length > 0 and (explode | all(. >= 32)))
      and has("subscription")
    then to_entries[] | "--" + .key, .value
    else error("Config must contain a subscription and supported nonempty string options only.")
    end
  ' "$CONFIG_FILE")" || exit 2
  while IFS= read -r argument; do
    CONFIG_ARGS+=("$argument")
  done <<< "$CONFIG_ARGUMENTS"
fi
# Bash 3 treats empty arrays as unset under nounset.
set -- ${CONFIG_ARGS[@]+"${CONFIG_ARGS[@]}"} ${CLI_ARGS[@]+"${CLI_ARGS[@]}"}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subscription)
      if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
        echo "Pass --subscription with a subscription ID or name." >&2
        exit 2
      fi
      TARGET_SUBSCRIPTION="${2:-}"; shift 2 ;;
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
    --app-configuration-store-name)
      APP_CONFIGURATION_STORE_NAME="${2:-}"; shift 2 ;;
    --app-configuration-resource-group)
      APP_CONFIGURATION_RESOURCE_GROUP="${2:-}"; shift 2 ;;
    --app-configuration-subscription-id)
      APP_CONFIGURATION_SUBSCRIPTION_ID="${2:-}"; shift 2 ;;
    --runtime-environment)
      RUNTIME_ENVIRONMENT="${2:-}"; shift 2 ;;
    --app-configuration-access-only)
      APP_CONFIGURATION_ACCESS_ONLY="true"; shift ;;
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

if [[ -n "$APP_CONFIGURATION_STORE_NAME" ]]; then
  if [[ -z "$APP_CONFIGURATION_RESOURCE_GROUP" ]]; then
    echo "Missing required: --app-configuration-resource-group" >&2
    exit 2
  fi
  case "$RUNTIME_ENVIRONMENT" in
    Test|Production) ;;
    *)
      echo "App Configuration requires --runtime-environment Test or Production, matching the store's feature flag label exactly. Development uses Azure CLI credentials and is for local runs." >&2
      exit 2 ;;
  esac
elif [[ -n "$APP_CONFIGURATION_RESOURCE_GROUP" || -n "$APP_CONFIGURATION_SUBSCRIPTION_ID" || -n "$RUNTIME_ENVIRONMENT" || "$APP_CONFIGURATION_ACCESS_ONLY" == "true" ]]; then
  echo "App Configuration options require --app-configuration-store-name." >&2
  exit 2
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI not found. Install it first: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if [[ -z "$TARGET_SUBSCRIPTION" ]]; then
  TARGET_SUBSCRIPTION="$(az account show --query id -o tsv)"
fi

# Scope every resource operation without changing the user's Azure CLI default subscription.
az_target() {
  az "$@" --subscription "$TARGET_SUBSCRIPTION"
}

normalize_name() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[ _]/-/g'
}

app_setting_exists() {
  local app_type="$1"
  local app_name="$2"
  local setting_name="$3"
  local count

  if [[ "$app_type" == "webapp" ]]; then
    count="$(az_target webapp config appsettings list \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --query "[?name=='${setting_name}'] | length(@)" \
      -o tsv)"
  else
    count="$(az_target functionapp config appsettings list \
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
    az_target webapp config appsettings set \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --settings "${setting_name}=${setting_value}" \
      >/dev/null
  else
    az_target functionapp config appsettings set \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --settings "${setting_name}=${setting_value}" \
      >/dev/null
  fi
}

seed_db_connection_if_missing() {
  local app_type="$1"
  local app_name="$2"

  if app_setting_exists "$app_type" "$app_name" "DB_CONNECTION"; then
    echo "Preserving existing app setting 'DB_CONNECTION' on '${app_name}'."
    return
  fi

  if [[ -z "$DB_CONNECTION_VALUE" ]]; then
    echo "Skipping missing app setting 'DB_CONNECTION' on '${app_name}' because no SQL admin password was provided."
    echo "Pass --sql-admin-password if this app needs DB_CONNECTION seeded."
    return
  fi

  seed_app_setting_if_missing "$app_type" "$app_name" "DB_CONNECTION" "$DB_CONNECTION_VALUE"
}

seed_dm_connection_if_missing() {
  local app_type="$1"
  local app_name="$2"

  if app_setting_exists "$app_type" "$app_name" "DM_CONNECTION"; then
    echo "Preserving existing app setting 'DM_CONNECTION' on '${app_name}'."
    return
  fi

  if [[ -z "$DATAMART_CONNECTION_STRING_VALUE" ]]; then
    echo "Skipping missing app setting 'DM_CONNECTION' on '${app_name}' because no datamart connection string was provided."
    echo "Pass --datamart-connection-string or set DM_CONNECTION if this app needs DM_CONNECTION seeded."
    return
  fi

  seed_app_setting_if_missing "$app_type" "$app_name" "DM_CONNECTION" "$DATAMART_CONNECTION_STRING_VALUE"
}

configure_app_configuration() {
  if [[ -z "$APP_CONFIGURATION_STORE_NAME" ]]; then
    return
  fi
  if [[ "$APP_CONFIGURATION_ACCESS_ONLY" == "true" ]]; then
    echo "App Configuration identity/access prepared. Endpoint and runtime environment were not changed."
    echo "Allow up to 15 minutes for access to propagate, then rerun without --app-configuration-access-only."
    return
  fi

  local endpoint
  endpoint="$(az_target deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.appConfigurationEndpoint.value" \
    -o tsv)"
  if [[ -z "$endpoint" ]]; then
    echo "Deployment did not return an App Configuration endpoint; app settings were not changed." >&2
    exit 1
  fi

  local matching_settings
  matching_settings="$(az_target webapp config appsettings list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --query "[?(name=='AppConfiguration__Endpoint' && value=='${endpoint}') || (name=='ASPNETCORE_ENVIRONMENT' && value=='${RUNTIME_ENVIRONMENT}') || (name=='DOTNET_ENVIRONMENT' && value=='${RUNTIME_ENVIRONMENT}')] | length(@)" \
    -o tsv)"
  if [[ "$matching_settings" == "3" ]]; then
    echo "App Configuration endpoint and runtime environment already match on '${WEB_APP_NAME}'."
    return
  fi

  # Set the endpoint and both environment keys together. DOTNET_ENVIRONMENT takes precedence
  # in WebApplication.CreateBuilder; leaving it stale could select another label or credential.
  echo "Configuring '${WEB_APP_NAME}' to use '${endpoint}' with label '${RUNTIME_ENVIRONMENT}'."
  az_target webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$WEB_APP_NAME" \
    --settings \
      "AppConfiguration__Endpoint=${endpoint}" \
      "ASPNETCORE_ENVIRONMENT=${RUNTIME_ENVIRONMENT}" \
      "DOTNET_ENVIRONMENT=${RUNTIME_ENVIRONMENT}" \
    >/dev/null
}

if [[ "$(az_target group exists -n "$RESOURCE_GROUP")" != "true" ]]; then
  if [[ "$WHAT_IF" == "true" ]]; then
    echo "Resource group '${RESOURCE_GROUP}' must already exist for --what-if. No changes were made." >&2
    exit 1
  fi
  LOCATION="${LOCATION:-westus2}"
  echo "Creating resource group '${RESOURCE_GROUP}' in '${LOCATION}'..."
  az_target group create -n "$RESOURCE_GROUP" -l "$LOCATION" >/dev/null
else
  if [[ -z "$LOCATION" ]]; then
    LOCATION="$(az_target group show -n "$RESOURCE_GROUP" --query location -o tsv)"
  fi
fi

NORMALIZED_APP_NAME="$(normalize_name "$APP_NAME")"
NORMALIZED_ENV="$(normalize_name "$ENVIRONMENT")"
if [[ -z "$NORMALIZED_ENV" ]]; then
  BASE_NAME="$NORMALIZED_APP_NAME"
else
  BASE_NAME="${NORMALIZED_APP_NAME}-${NORMALIZED_ENV}"
fi

SQL_SERVER_NAME_PREFIX="sql-${BASE_NAME}-"
SQL_SERVER_MATCHES="$(az_target sql server list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?starts_with(name, '${SQL_SERVER_NAME_PREFIX}')].name" \
  -o tsv)"
SQL_SERVER_MATCH_COUNT="$(printf '%s\n' "$SQL_SERVER_MATCHES" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ "$SQL_SERVER_MATCH_COUNT" -gt 1 ]]; then
  echo "Found multiple SQL servers matching '${SQL_SERVER_NAME_PREFIX}' in '${RESOURCE_GROUP}':" >&2
  printf '%s\n' "$SQL_SERVER_MATCHES" >&2
  echo "Refusing to guess which existing SQL server to use." >&2
  exit 1
elif [[ "$SQL_SERVER_MATCH_COUNT" == "1" ]]; then
  CREATE_SQL_SERVER="false"
  SQL_SERVER_NAME_OVERRIDE="$(printf '%s\n' "$SQL_SERVER_MATCHES" | sed '/^$/d' | head -n 1)"
  EXISTING_SQL_ADMIN_LOGIN="$(az_target sql server show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$SQL_SERVER_NAME_OVERRIDE" \
    --query administratorLogin \
    -o tsv)"

  if [[ -n "$SQL_ADMIN_LOGIN_VALUE" && "$SQL_ADMIN_LOGIN_VALUE" != "$EXISTING_SQL_ADMIN_LOGIN" ]]; then
    echo "Ignoring --sql-admin-login '${SQL_ADMIN_LOGIN_VALUE}' because existing SQL server '${SQL_SERVER_NAME_OVERRIDE}' uses '${EXISTING_SQL_ADMIN_LOGIN}'."
  fi

  SQL_ADMIN_LOGIN_VALUE="$EXISTING_SQL_ADMIN_LOGIN"
  echo "Using existing SQL server '${SQL_SERVER_NAME_OVERRIDE}'. SQL admin login/password are not required for infrastructure deployment."
else
  if [[ -z "$SQL_ADMIN_LOGIN_VALUE" ]]; then
    echo "Missing required: --sql-admin-login (needed because no existing SQL server matching '${SQL_SERVER_NAME_PREFIX}' was found)" >&2
    usage
    exit 2
  fi

  if [[ -z "$SQL_ADMIN_PASSWORD_VALUE" ]]; then
    read -r -s -p "SQL admin password: " SQL_ADMIN_PASSWORD_VALUE
    echo
  fi

  if [[ -z "$SQL_ADMIN_PASSWORD_VALUE" ]]; then
    echo "Missing required SQL password (needed because SQL server '${SQL_SERVER_NAME_PREFIX}<token>' will be created)" >&2
    exit 2
  fi
fi

DEPLOYMENT_NAME="walter-${APP_NAME}${ENVIRONMENT:+-${ENVIRONMENT}}-$(date -u +%Y%m%d%H%M%S)"

AZ_PARAMS=(
  "location=${LOCATION}"
  "appName=${APP_NAME}"
  "appServicePlanId=${APP_SERVICE_PLAN_ID}"
  "createSqlServer=${CREATE_SQL_SERVER}"
  "linuxFxVersion=${LINUX_FX_VERSION}"
  "functionLinuxFxVersion=${FUNCTION_LINUX_FX_VERSION}"
  "allowAzureServicesToSql=${ALLOW_AZURE_SERVICES_TO_SQL}"
)

if [[ -n "$SQL_SERVER_NAME_OVERRIDE" ]]; then
  AZ_PARAMS+=("sqlServerNameOverride=${SQL_SERVER_NAME_OVERRIDE}")
fi

if [[ -n "$SQL_ADMIN_LOGIN_VALUE" ]]; then
  AZ_PARAMS+=("sqlAdminLogin=${SQL_ADMIN_LOGIN_VALUE}")
fi

if [[ -n "$SQL_ADMIN_PASSWORD_VALUE" ]]; then
  AZ_PARAMS+=("sqlAdminPassword=${SQL_ADMIN_PASSWORD_VALUE}")
fi

if [[ -n "$ENVIRONMENT" ]]; then
  AZ_PARAMS+=("env=${ENVIRONMENT}")
fi

if [[ -n "$APP_CONFIGURATION_STORE_NAME" ]]; then
  AZ_PARAMS+=(
    "appConfigurationStoreName=${APP_CONFIGURATION_STORE_NAME}"
    "appConfigurationResourceGroupName=${APP_CONFIGURATION_RESOURCE_GROUP}"
  )
  if [[ -n "$APP_CONFIGURATION_SUBSCRIPTION_ID" ]]; then
    AZ_PARAMS+=("appConfigurationSubscriptionId=${APP_CONFIGURATION_SUBSCRIPTION_ID}")
  fi
fi

if [[ "$WHAT_IF" == "true" ]]; then
  az_target deployment group what-if \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "${AZ_PARAMS[@]}"
  if [[ -n "$APP_CONFIGURATION_STORE_NAME" && "$APP_CONFIGURATION_ACCESS_ONLY" != "true" ]]; then
    echo "After deployment, the script would update only AppConfiguration__Endpoint, ASPNETCORE_ENVIRONMENT, and DOTNET_ENVIRONMENT on the web app, using this store and '${RUNTIME_ENVIRONMENT}'."
  fi
else
  az_target deployment group create \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "${AZ_PARAMS[@]}"

  WEB_APP_NAME="$(az_target deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.webAppName.value" \
    -o tsv)"
  FUNCTION_APP_NAME="$(az_target deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.functionAppName.value" \
    -o tsv)"
  FUNCTION_STORAGE_ACCOUNT_NAME="$(az_target deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.functionStorageAccountName.value" \
    -o tsv)"
  SQL_SERVER_FQDN="$(az_target deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.sqlServerFqdn.value" \
    -o tsv)"
  SQL_DB_NAME="$(az_target deployment group show \
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

  DB_CONNECTION_VALUE=""
  if [[ -n "$SQL_ADMIN_LOGIN_VALUE" && -n "$SQL_ADMIN_PASSWORD_VALUE" ]]; then
    DB_CONNECTION_VALUE="Server=tcp:${SQL_SERVER_FQDN},1433;Initial Catalog=${SQL_DB_NAME};Persist Security Info=False;User ID=${SQL_ADMIN_LOGIN_VALUE};Password=${SQL_ADMIN_PASSWORD_VALUE};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
  fi

  FUNCTION_STORAGE_CONNECTION="$(az_target storage account show-connection-string \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_STORAGE_ACCOUNT_NAME" \
    --query connectionString \
    -o tsv)"

  seed_db_connection_if_missing "webapp" "$WEB_APP_NAME"
  seed_dm_connection_if_missing "webapp" "$WEB_APP_NAME"
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
  seed_db_connection_if_missing "functionapp" "$FUNCTION_APP_NAME"
  seed_dm_connection_if_missing "functionapp" "$FUNCTION_APP_NAME"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "Datamart__ApplicationName" "$DATAMART_FUNCTION_APP_NAME"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "NOTIFICATIONS_SENDER_SCHEDULE" "0 */15 * * * *"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE" "0 0 9 2 * *"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "Notifications__SenderEnabled" "false"
  seed_app_setting_if_missing "functionapp" "$FUNCTION_APP_NAME" "Notifications__AccrualGenerationEnabled" "false"

  configure_app_configuration
fi
