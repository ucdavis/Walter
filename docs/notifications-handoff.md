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

Sender processing should remain disabled until SMTP delivery is configured and the rendered templates have been previewed against representative queued payloads.

## Local Validation

As of 2026-05-08, a local accrual generation run successfully executed `GenerateMonthlyAccrualNotificationsAsync` and inserted rows into `OutboundMessages`. These counts and skip reasons are an observation from that run and may change as source data, validation, or message-building rules change.

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
- `DM_CONNECTION` is the accrual data source where `dbo.EmployeeVacationAccrualBalances` lives.

If these are reversed, generation fails or writes to the wrong database. One observed failure was `Invalid object name 'dbo.EmployeeVacationAccrualBalances'` when `DM_CONNECTION` pointed at the app DB.

## Current Sender Safety Pieces

The worker is intentionally safe for delivery right now:

- `AccrualOutboundMessageRenderer` renders the current accrual template keys from queued payload JSON.
- Razor templates now produce both MJML-backed HTML bodies and plain-text fallback bodies.
- Email subjects are generated in code because they are short routing outcomes rather than full body templates.
- `DisabledOutboundEmailClient` remains the registered client while `Notifications__SenderEnabled=false`.
- If `Notifications__SenderEnabled=true`, the worker validates SMTP settings at startup before it can claim queue rows.
- `Notifications__SenderEnabled` should remain `false` until SMTP config and rendered template previews are validated.

## Main Follow-Up Work

### 1. Real Email Rendering

Razor/MJML rendering is implemented for the current template keys:

- `accrual.employee.faculty-academic.v1`
- `accrual.employee.staff.v1`
- `accrual.viewer-report.v1`

Rendering is deterministic from `OutboundMessage.PayloadJson`, `TemplateKey`, `TemplateVersion`, and `PayloadVersion`. The renderer does not query accrual source data again during rendering; the queued payload is the durable message contract.

Expected rendering output:

- Subject generated in `AccrualOutboundMessageRenderer`.
- Plain text body rendered from `*_text.cshtml`.
- HTML body rendered from `*_mjml.cshtml` through MJML compilation.

Covered by focused renderer tests:

- Rendering for each employee template key and the viewer report template.
- Invalid or unsupported `TemplateKey` fails clearly and leaves the message retryable/dead-letterable through sender behavior.
- Payload version mismatch is handled intentionally.
- HTML encoding protects recipient names, departments, and other payload fields.
- Invalid or absent `App__BaseUrl` omits viewer report links instead of failing delivery.

Remaining rendering follow-up:

- Confirm final employee and AccrualViewer wording with product owners.
- Preview representative real payloads before enabling sender processing.
- Consider extracting rendering into a future `server.notifications` project if `server.core` needs to become lean again. See `docs/razor-email-rendering-tradeoff.md`.

### 2. SMTP Email Sending

SMTP delivery is implemented through `SmtpOutboundEmailClient` and MailKit.

The worker registers the SMTP client only when `Notifications__SenderEnabled=true` and the SMTP configuration is complete. Missing or partial SMTP configuration fails worker startup instead of claiming and mutating queued messages.

Current settings:

- `Notifications__Smtp__Host`
- `Notifications__Smtp__Port`
- `Notifications__Smtp__UserName`
- `Notifications__Smtp__Password`
- `Notifications__Smtp__FromAddress`
- `Notifications__Smtp__FromDisplayName`
- `Notifications__Smtp__ReplyToAddress`
- `Notifications__Smtp__ReplyToDisplayName`
- `Notifications__Smtp__SecureSocketMode` (`Auto`, `None`, `StartTlsWhenAvailable`, `StartTls`, or `SslOnConnect`)
- `Notifications__Smtp__TimeoutMilliseconds`

The client sends multipart text/HTML MIME messages, supports optional SMTP authentication, and stores the generated RFC `Message-Id` on the queue row after a successful send. The SMTP relay response is logged at debug level.

Covered by focused SMTP/sender tests:

- SMTP client receives expected recipient, subject, text body, and HTML body.
- Generated message id is captured after successful send.
- Missing credentials skip SMTP authentication.
- Incomplete SMTP configuration fails clearly.
- Invalid recipient email fails before opening an SMTP connection.
- Transient SMTP failures produce retry status.
- Permanent failures eventually dead-letter according to existing retry policy.
- Sender disabled path does not claim or mutate messages.

### 3. Configuration And Deployment Readiness

Add worker-specific configuration docs and deployment settings for SMTP.

Confirm Azure Function App settings include:

- `AzureWebJobsStorage`
- `FUNCTIONS_WORKER_RUNTIME=dotnet-isolated`
- `DB_CONNECTION`
- `DM_CONNECTION`
- `App__BaseUrl` if viewer report emails should link back to Walter
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

Before enabling delivery, confirm:

- Employee call to action differs by employee group only where intended.
- Faculty Academic, Staff, and Generic wording matches the domain language in `CONTEXT.md`.
- Viewer report content should include department breakdown, total impacted employees, lost cost, waste rate, and snapshot date.
- Viewer report links should point back to `/accruals` when `App__BaseUrl` is configured.

## Fresh Session Prompt

If continuing in a fresh agent session, a useful prompt is:

```text
Continue the Walter notifications work. Read docs/notifications-handoff.md, docs/razor-email-rendering-tradeoff.md, CONTEXT.md, and the worker/services under web/workers/notifications and web/server.core/Services. Razor/MJML rendering and SMTP-backed delivery are implemented, but Notifications__SenderEnabled should remain false until SMTP settings and rendered template previews are validated. The next main tasks are deployment configuration, representative payload preview, observability improvements, and final product wording checks. Preserve dedupe behavior and add focused tests.
```
