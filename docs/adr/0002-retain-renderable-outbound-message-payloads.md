# Retain renderable outbound message payloads

Walter will retain `OutboundMessages` indefinitely, including the structured payload data needed to render the email even when that payload contains PII. This favors permanent auditability and idempotency for notification delivery over minimizing historical application data retention.

**Considered Options**

- Retain only delivery metadata and delete or redact message payloads after sending.
- Retain the structured payload needed to generate each outbound email.

**Consequences**

Outbound message payloads must be treated as sensitive application data. Future reporting, admin views, exports, and support tooling must avoid casually exposing retained payload contents.

**Governance Obligations**

Retaining `OutboundMessages` and their structured payload data requires explicit governance controls before the retained payloads are broadly exposed through operational tooling:

- Assign an owner for retention governance and review the lawful basis, business need, and retention risk at least annually.
- Define retention exceptions for cases where a structured payload must be deleted or redacted, including legal, privacy, security, or contractual obligations that override indefinite retention.
- Restrict payload viewing and export to role-based, least-privilege access paths approved for support, compliance, or delivery operations.
- Audit log payload reads, exports, and administrative access, including actor, time, purpose or request context, and affected message identifiers.
- Support legal holds by suspending deletion or redaction for affected `OutboundMessages`, and require a documented workflow to release holds and resume deletion when permitted.
- Define a data subject request procedure for locating, exporting, redacting, or deleting retained payload data where applicable law or policy requires it.
- Encrypt retained payloads at rest and apply field-level protection expectations for PII, such as masking, redaction, or separate protection for high-risk fields when displayed or exported.
