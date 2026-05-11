# Notifications Worker

Azure Functions isolated worker for Walter scheduled notification jobs.

This project owns timer-triggered notification work that should not run inside the ASP.NET web app process. It references `server.core` for queueing, accrual notification generation, placeholder rendering, and outbound message sending.

## Functions

- `GenerateMonthlyAccrualNotificationsAsync`
  - Timer setting: `NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE`
  - Default schedule: `0 0 9 1 * *`
  - Meaning: 9:00 UTC on the first day of each month.
  - Builds monthly accrual employee messages and Accrual Viewer report messages.
- `ProcessOutboundMessagesAsync`
  - Timer setting: `NOTIFICATIONS_SENDER_SCHEDULE`
  - Default schedule: `0 */15 * * * *`
  - Meaning: every 15 minutes.
  - Claims due `OutboundMessages`, renders email content, sends through the configured email client, and marks rows sent/retry/dead-letter.

Both jobs are disabled by default:

```json
{
  "Notifications__SenderEnabled": "false",
  "Notifications__AccrualGenerationEnabled": "false"
}
```

Enable each job independently only after its dependencies are configured.

## Current Wiring

The worker currently uses:

- `OutboundMessageQueue` for queue persistence.
- `AccrualNotificationGenerator` for monthly accrual queue generation.
- `PlaceholderOutboundMessageRenderer` for temporary email rendering.
- `DisabledOutboundEmailClient`, which throws if sending is enabled before real email delivery is configured.
- `DatamartService` for accrual report data and other Datamart-backed queries.

This means the deployed worker is safe by default for email delivery. It can be deployed before real email integration is finished, but `Notifications__SenderEnabled` must remain `false` until email delivery is configured.

## Configuration

This Function App does not read `web/server/appsettings.json`. It is a separate host process with its own configuration.

Configuration sources:

- Azure Function App application settings.
- Local `local.settings.json` when running with Azure Functions Core Tools.
- Optional worker-local `appsettings.json` / `appsettings.{Environment}.json` if added later.
- Environment variables.

Required now:

- `AzureWebJobsStorage`: required by the Azure Functions runtime.
- `FUNCTIONS_WORKER_RUNTIME=dotnet-isolated`: required by the Azure Functions runtime.
- `DB_CONNECTION`: app database connection string used by `AppDbContext`.
- `DM_CONNECTION`: Datamart connection string used by `DatamartService`.
- `Datamart__ApplicationName`: application name sent to Datamart for logging/auditing.
- `NOTIFICATIONS_SENDER_SCHEDULE`: NCRONTAB schedule for sender processing.
- `NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE`: NCRONTAB schedule for monthly accrual generation.
- `Notifications__SenderEnabled`: must be `true` before sender processing will run.
- `Notifications__AccrualGenerationEnabled`: must be `true` before monthly accrual generation will run.

Expected future settings:

- SMTP/SparkPost settings for the real outbound email client.
- MJML/Razor template settings if needed by the final renderer.

## Local Development

Copy `local.settings.sample.json` to `local.settings.json` and fill in local secrets. `local.settings.json` is ignored by git.

```bash
cd web/workers/notifications
func start
```

To keep local runs inert, leave both enabled flags set to `false`. To test a specific timer path, enable only that job and ensure its dependencies are wired.

## Deployment

`web/azure-pipelines.yml` publishes this project into `notifications-worker.zip` and deploys it with `AzureFunctionApp@2`.

Infrastructure in `infrastructure/azure/main.bicep` creates a separate Linux Function App on the same existing App Service Plan as the web app, plus the storage account required by the Functions runtime.

The pipeline expects a `functionAppName` variable in the same variable group that provides `webAppName`.
