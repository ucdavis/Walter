# Retain renderable outbound message payloads

Walter will retain `OutboundMessages` indefinitely, including the structured payload data needed to render the email even when that payload contains PII. This favors permanent auditability and idempotency for notification delivery over minimizing historical application data retention.

**Considered Options**

- Retain only delivery metadata and delete or redact message payloads after sending.
- Retain the structured payload needed to generate each outbound email.

**Consequences**

Outbound message payloads must be treated as sensitive application data. Future reporting, admin views, exports, and support tooling must avoid casually exposing retained payload contents.
