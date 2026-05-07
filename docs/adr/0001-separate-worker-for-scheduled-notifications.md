# Use a separate worker project for scheduled notifications

Walter will run scheduled accrual queueing and outbound message sending from a separate worker or Azure Functions project rather than from the ASP.NET Core web app process. The web app already owns HTTP/UI concerns, while scheduled notification work needs timer triggers, independent execution, retry behavior, and isolation from request traffic and web app restarts.

**Considered Options**

- Run the jobs as hosted services inside the web app.
- Run the jobs from a separate worker or Azure Functions project that shares app data code where appropriate.

**Consequences**

This adds another deployable component, but keeps background delivery work separate from the web app lifecycle and leaves room to scale or schedule senders independently.
