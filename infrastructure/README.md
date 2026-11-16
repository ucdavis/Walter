# Infrastructure

This folder contains infrastructure-as-code for the Walter project.

## Azure (Bicep)

The Azure IaC lives in `infrastructure/azure/` and is designed to provision the minimum resources needed to run the `web/` app.

### What gets created

Deployed by `infrastructure/azure/main.bicep`:

- **Azure SQL Server** + **SQL Database** (Basic SKU by default)
- **Azure App Service (Linux) Web App** (uses an existing App Service Plan you provide)
- **Azure Functions App (Linux)** for scheduled notification work (uses the same existing App Service Plan)
- **Storage Account** for the Azure Functions runtime
- Optional: SQL firewall rule `AllowAzureServices` (`0.0.0.0`) when `allowAzureServicesToSql=true`
- Optional: Web App system-assigned identity and store-scoped App Configuration Data Reader access to an existing store

After the Bicep deployment succeeds, `infrastructure/azure/scripts/deploy.sh` seeds these app settings when missing:

- **App Setting**: `DB_CONNECTION` on the Web App (built from the SQL server/db + SQL login/password when a SQL password is provided)
- **App Setting**: `DM_CONNECTION` on the Web App for Datamart-backed reports
- **App Setting**: `Datamart__ApplicationName` on the Web App for Datamart logging/auditing
- **App Setting**: `DB_CONNECTION` on the Functions App for queue and notification generation access when a SQL password is provided
- **App Setting**: `DM_CONNECTION` on the Functions App for Datamart-backed accrual generation
- **App Setting**: `Datamart__ApplicationName` on the Functions App for Datamart logging/auditing
- Notification timer jobs are seeded disabled by default via `Notifications__SenderEnabled=false` and `Notifications__AccrualGenerationEnabled=false`

These settings are additive-only defaults. The deployment script creates them when missing and preserves existing values on later runs. If `DB_CONNECTION` is missing, pass `--sql-admin-password` to seed that missing setting. If `DM_CONNECTION` is missing, pass `--datamart-connection-string` or set `DM_CONNECTION` to seed it. Explicit App Configuration opt-in manages its endpoint and runtime environment separately, as described below.

### Naming

Resources are generated deterministically from `resourceGroup().id`, `appName`, and `env`:

- Web App: `web-<appName>-<env>-<token>`
- Functions App: `func-<appName>-<env>-<token>`
- SQL Server: `sql-<appName>-<env>-<token>` (globally unique)
- SQL Database: `<appName>` (the DB name does **not** include env/token because it lives under the server)

`env` is optional. If omitted, names become `web-<appName>-<token>`, `func-<appName>-<token>`, and `sql-<appName>-<token>`; function storage remains `st<token><functions-token>`.

### Deploy

Prereqs:

- Azure CLI (`az`) installed and authenticated (`az login`)
- `jq` installed when using a saved JSON configuration
- Select the intended subscription with a saved configuration or `--subscription`. Manual invocations without either use the current Azure CLI subscription. The script passes the selected subscription on every resource operation without changing the CLI default.
- An **existing App Service Plan** (Linux-capable) to host the Web App (you pass its resource ID)

Deploy against existing generated SQL infrastructure (creates the resource group if missing):

```bash
infrastructure/azure/scripts/deploy.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test \
  --app-service-plan-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/serverfarms/<plan>"
```

Create new SQL infrastructure:

```bash
infrastructure/azure/scripts/deploy.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test \
  --app-service-plan-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/serverfarms/<plan>" \
  --sql-admin-login walter \
  --datamart-connection-string "$DM_CONNECTION"
```

What-if mode (no changes):

```bash
infrastructure/azure/scripts/deploy.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test \
  --app-service-plan-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/serverfarms/<plan>" \
  --what-if
```

### App Configuration

App Configuration is opt-in. With no store name, this flow does not configure an endpoint or runtime environment. The template never creates a store or feature flags. `appConfigurationStoreName`, `appConfigurationResourceGroupName`, and `appConfigurationSubscriptionId` select an existing store, including one in another subscription within the same Microsoft Entra tenant. The deploying account needs permission to deploy into the store's resource group, read the store, and create role assignments at store scope.

Saved configurations include the verified resource group, App Service Plan, naming inputs, and separate deployment/store subscription IDs. They contain no secrets or endpoint URLs. Command-line arguments override configuration values.

| Configuration | Deployment | Shared store | Flag label |
| --- | --- | --- | --- |
| [`test.json`](azure/config/test.json) | `rg-walter-test`, TEST subscription | `appcs-caes-shared-test` in `rg-shared-appconfig-test` | `Test` |
| [`production.json`](azure/config/production.json) | `rg-walter-prod`, Production subscription | `appcs-caes-shared-prod` in `rg-shared-appconfig` | `Production` |

Preview either environment from the repository root:

```bash
infrastructure/azure/scripts/deploy.sh \
  --config infrastructure/azure/config/test.json --what-if
infrastructure/azure/scripts/deploy.sh \
  --config infrastructure/azure/config/production.json --what-if
```

To provision access before enabling the endpoint, select the intended configuration and add `--app-configuration-access-only`:

```bash
infrastructure/azure/scripts/deploy.sh \
  --config infrastructure/azure/config/test.json \
  --app-configuration-access-only
```

Allow up to [15 minutes for the role assignment to propagate](https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-enable-rbac), then rerun without `--app-configuration-access-only`. The script reads the endpoint from the selected store and updates only `AppConfiguration__Endpoint`, `ASPNETCORE_ENVIRONMENT`, and `DOTNET_ENVIRONMENT` together, preserving unrelated settings. Both environment keys use the exact label supplied by `--runtime-environment`, since `DOTNET_ENVIRONMENT` takes precedence in this app. The access-only option skips these three settings; normal infrastructure deployment and default seeding still run. Direct Bicep deployments provision access and output `appConfigurationEndpoint`; the script owns the settings update.

The hosted runtime accepts `Test` or `Production` here. The TEST store also serves local `Development`, which uses Azure CLI authentication as described in [web/README.md](../web/README.md). Shared store creation remains outside Walter's deployment. Removing the opt-in arguments later does not remove existing settings or access. A configured endpoint requires the store to be reachable and authorized at startup, so verify access before enabling it. `--what-if` previews Bicep changes and describes the subsequent settings update without applying it.

### SQL firewall: allow the Web App outbound IPs

Azure SQL uses firewall rules. If your SQL server has `publicNetworkAccess` enabled (it does by default in this template), you typically still need to **allow the Web App’s outbound IPs** or SQL connections from the Web App will fail.

`infrastructure/azure/scripts/sync-sql-firewall.sh` is an idempotent helper that:

- Reads the Web App’s **outboundIpAddresses** and **possibleOutboundIpAddresses**
- Creates/updates SQL firewall rules for each IP
- Deletes stale rules previously created by this script (same naming prefix)

Preview changes:

```bash
infrastructure/azure/scripts/sync-sql-firewall.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test \
  --what-if
```

Apply:

```bash
infrastructure/azure/scripts/sync-sql-firewall.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test
```

Notes:

- By default it uses both “current” and “possible” outbound IPs. To only use current IPs, add `--current-only`.
- It auto-discovers the web app + sql server by the naming prefix. If you have multiple matches, pass explicit names via `--web-app-name` and/or `--sql-server-name`.
- Azure Pipelines deploys the Functions package using a `functionAppName` variable. Set it from the `functionAppName` Bicep output in the same variable group that provides `webAppName`.

### Troubleshooting

- `Cannot find serverFarm with name ...`:
  - The App Service Plan ID you passed doesn’t exist in the subscription/resource group you’re deploying into (or you don’t have access to it). Double-check the `--app-service-plan-id` and the active subscription (`az account show`).
- SQL connectivity from the Web App fails:
  - Run the firewall sync script above (or enable `allowAzureServicesToSql=true` temporarily, if appropriate for your security posture).
