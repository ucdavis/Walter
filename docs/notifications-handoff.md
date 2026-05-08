# Notifications Handoff

## Current State

Walter now has a separate Azure Functions isolated worker for scheduled notification work:

- Worker project: `web/workers/notifications`
- Function entrypoint: `web/workers/notifications/NotificationFunctions.cs`
- Shared queue/generation services: `web/server.core/Services`
- Queue table: `dbo.OutboundMessages`

The worker has two timer-triggered functions:

- `GenerateMonthlyAccrualNotificationsAsync`
  - Reads accrual snapshot data.
  - Builds employee accrual messages and AccrualViewer report messages.
  - Enqueues valid message drafts into `OutboundMessages`.
- `ProcessOutboundMessagesAsync`
  - Claims due outbound messages.
  - Renders message content.
  - Sends messages through the configured email client.
  - Marks messages sent, retry, or dead-letter.

Both worker paths are guarded by options:

- `Notifications__AccrualGenerationEnabled`
- `Notifications__SenderEnabled`

Sender processing should remain disabled until real rendering and SMTP delivery are configured.

## Local Validation

A local accrual generation run successfully executed `GenerateMonthlyAccrualNotificationsAsync` and inserted rows into `OutboundMessages`.

Successful run:

- `RunId`: `e7b4d63b-9a30-4986-9659-3a481117e40f`
- `SourceRecordCount`: `25418`
- `EmployeeCandidateCount`: `346`
- `ViewerRecipientCount`: `4`
- `DraftCount`: `295`
- `EnqueuedCount`: `295`
- `DuplicateCount`: `0`
- `SkippedCount`: `55`

Database verification after the run showed:

- `291` pending `accrual.employee` messages.
- `4` pending `accrual.viewer-report` messages.

`SkippedCount` currently means the message builder skipped a candidate because the recipient email was missing, blank, malformed, or failed `MailAddress` validation. The only current skip reason is `InvalidRecipientEmail`.

## Dedupe Behavior

Dedupe is enforced through `OutboundMessages.DedupeKey`.

Current dedupe keys:

- Employee message: `accrual:employee:{employeeId}:{snapshotAsOfDate:yyyy-MM-dd}`
- Viewer report: `accrual:viewer-report:{userId}:{snapshotAsOfDate:yyyy-MM-dd}`

The intended behavior is one employee notification per employee per accrual snapshot and one viewer report per AccrualViewer user per accrual snapshot.

Operational implication:

- Rerunning generation without deleting rows should produce duplicates rather than new queue rows for the same snapshot.
- Deleting or truncating `OutboundMessages` removes dedupe history for those rows.
- For local retests, prefer deleting a specific `RunId` or accrual notification types instead of truncating the whole table in shared databases.

## Local Testing Notes

The helper script is:

```bash
web/workers/notifications/run-local-test.sh
```

It enables accrual generation, keeps sender disabled by default, shortens the generation schedule, and starts the Functions host.

Azure Functions timer triggers require Azure Storage for schedule and host lock state. For local testing, Azurite must be healthy on all standard development storage ports:

- Blob: `10000`
- Queue: `10001`
- Table: `10002`

During validation, the VS Code Azurite extension was listening on these ports but returned HTTP 500 for blob writes used by Functions host locks. A fresh Azurite process worked. Prefer Docker Azurite for repeatable local worker testing.

Important connection mapping:

- `DB_CONNECTION` is the app database where `OutboundMessages`, users, roles, and permissions live.
- `DM_CONNECTION` is the accrual data source where `dbo.EmployeeAccrualBalances` lives.

If these are reversed, generation fails or writes to the wrong database. One observed failure was `Invalid object name 'dbo.EmployeeAccrualBalances'` when `DM_CONNECTION` pointed at the app DB.

## Current Placeholder Pieces

The worker is intentionally safe for delivery right now:

- `PlaceholderOutboundMessageRenderer` exists only as a temporary renderer.
- `DisabledOutboundEmailClient` throws if sender processing is enabled.
- `Notifications__SenderEnabled` should remain `false` until real delivery is implemented and configured.

## Main Follow-Up Work

### 1. Real Email Rendering

Replace or extend `PlaceholderOutboundMessageRenderer` with production rendering for the current template keys:

- `accrual.employee.faculty-academic.v1`
- `accrual.employee.staff.v1`
- `accrual.employee.generic.v1`
- `accrual.viewer-report.v1`

Rendering should be deterministic from `OutboundMessage.PayloadJson`, `TemplateKey`, `TemplateVersion`, and `PayloadVersion`. Avoid querying accrual source data again during rendering; the queued payload is the durable message contract.

Expected rendering output:

- Subject
- Plain text body
- HTML body

Recommended tests:

- One rendering test per template key.
- Invalid or unsupported `TemplateKey` fails clearly and leaves the message retryable/dead-letterable through sender behavior.
- Payload version mismatch is handled intentionally.
- HTML encoding protects recipient names, departments, and other payload fields.
- The viewer report template can handle many departments without unreadable output.

### 2. SMTP Email Sending

Implement a real `IOutboundEmailClient` backed by SMTP and wire it into the worker through configuration.

Likely settings:

- SMTP host
- SMTP port
- Username
- Password or secret reference
- From address
- From display name
- TLS/SSL mode
- Optional reply-to

Keep `DisabledOutboundEmailClient` available as the default when SMTP settings are absent or sender is disabled. Do not make a partial SMTP configuration silently send mail.

Recommended sender tests:

- SMTP client receives expected recipient, subject, text body, and HTML body.
- Provider message id is captured when available.
- Transient SMTP failures produce retry status.
- Permanent failures eventually dead-letter according to existing retry policy.
- Sender disabled path does not claim or mutate messages.

### 3. Configuration And Deployment Readiness

Add worker-specific configuration docs and deployment settings for rendering and SMTP.

Confirm Azure Function App settings include:

- `AzureWebJobsStorage`
- `FUNCTIONS_WORKER_RUNTIME=dotnet-isolated`
- `DB_CONNECTION`
- `DM_CONNECTION`
- `Datamart__ApplicationName`
- `NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE`
- `NOTIFICATIONS_SENDER_SCHEDULE`
- `Notifications__AccrualGenerationEnabled`
- `Notifications__SenderEnabled`
- SMTP settings once delivery is ready

Before enabling delivery in any shared environment:

- Confirm `OutboundMessages` migration is applied.
- Confirm `DM_CONNECTION` points at the accrual data source.
- Run generation with sender disabled.
- Inspect queued sample payloads.
- Enable sender only after SMTP config and templates are validated.

### 4. Observability

Current logs include generation counts and sender processing counts. Useful additions:

- Log skip reason counts, especially invalid email count.
- Log notification type counts when enqueuing.
- Include `RunId` consistently through generation, enqueue, render, send, retry, and dead-letter logs.
- Consider structured logging around `DedupeKey` only at debug level to avoid noisy logs.

Avoid logging full payload JSON or recipient email lists at information level.

### 5. Data Quality Follow-Up

The successful run skipped 55 recipients due to invalid or missing email. Follow-up options:

- Add a report/query for skipped accrual candidates by employee id and skip reason.
- Decide whether missing employee emails should be surfaced to admins or data owners.
- Consider making skip details queryable if operations need to reconcile expected notification counts.

### 6. Template/Product Decisions

Before finalizing templates, confirm:

- Employee call to action differs by employee group only where intended.
- Faculty Academic, Staff, and Generic wording matches the domain language in `CONTEXT.md`.
- Viewer report content should include department breakdown, total impacted employees, lost cost, waste rate, and snapshot date.
- Links should point back to the relevant Walter accrual reporting view if a stable route exists.

## Fresh Session Prompt

If continuing in a fresh agent session, a useful prompt is:

```text
Continue the Walter notifications work. Read docs/notifications-handoff.md, CONTEXT.md, and the worker/services under web/workers/notifications and web/server.core/Services. The next main tasks are production email rendering for the accrual template keys and SMTP-backed IOutboundEmailClient delivery, while keeping sender disabled by default until configured. Preserve dedupe behavior and add focused tests.
```
