# Infrastructure

This folder contains infrastructure-as-code for the Walter project.

## Azure (Bicep)

The Azure IaC lives in `infrastructure/azure/` and is designed to provision the minimum resources needed to run the `web/` app.

### What gets created

Deployed by `infrastructure/azure/main.bicep`:

- **Azure SQL Server** + **SQL Database** (Basic SKU by default)
- **Azure App Service (Linux) Web App** (uses an existing App Service Plan you provide)
- **App Setting**: `DB_CONNECTION` on the Web App (built from the SQL server/db + SQL login/password you pass at deploy time)
- Optional: SQL firewall rule `AllowAzureServices` (`0.0.0.0`) when `allowAzureServicesToSql=true`

### Naming

Resources are generated deterministically from `resourceGroup().id`, `appName`, and `env`:

- Web App: `web-<appName>-<env>-<token>`
- SQL Server: `sql-<appName>-<env>-<token>` (globally unique)
- SQL Database: `<appName>` (the DB name does **not** include env/token because it lives under the server)

`env` is optional. If omitted, names become `web-<appName>-<token>` / `sql-<appName>-<token>`.

### Deploy

Prereqs:

- Azure CLI (`az`) installed and authenticated (`az login`)
- You’re targeting the intended subscription (check with `az account show`)
- An **existing App Service Plan** (Linux-capable) to host the Web App (you pass its resource ID)

Deploy (creates the resource group if missing):

```bash
SQL_ADMIN_PASSWORD='...' \
infrastructure/azure/scripts/deploy.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test \
  --app-service-plan-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/serverfarms/<plan>" \
  --sql-admin-login walter
```

What-if mode (no changes):

```bash
SQL_ADMIN_PASSWORD='...' \
infrastructure/azure/scripts/deploy.sh \
  -g rg-walter-test \
  --app-name walter \
  --env test \
  --app-service-plan-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/serverfarms/<plan>" \
  --sql-admin-login walter \
  --what-if
```

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

### Troubleshooting

- `Cannot find serverFarm with name ...`:
  - The App Service Plan ID you passed doesn’t exist in the subscription/resource group you’re deploying into (or you don’t have access to it). Double-check the `--app-service-plan-id` and the active subscription (`az account show`).
- SQL connectivity from the Web App fails:
  - Run the firewall sync script above (or enable `allowAzureServicesToSql=true` temporarily, if appropriate for your security posture).

