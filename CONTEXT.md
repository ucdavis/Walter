# Walter Context

Walter helps UC Davis users inspect project, personnel, financial, and accrual reporting data and act on report-driven risk signals.

## Language

**Accrual Snapshot**:
The available vacation accrual balance view for employees as of a specific reporting date, including the most recent non-empty employee email needed for notification.
_Avoid_: Report run, extract

**Approaching Cap**:
An employee accrual status used when the employee's vacation balance is at least 80% of their cap but below the at-cap threshold.
_Avoid_: Near cap, almost capped

**At Cap**:
An employee accrual status used when the employee's vacation balance is at least 96% of their cap.
_Avoid_: Maxed out, literally 100%

**Accrual Notification**:
A monthly reminder sent to employees whose latest accrual status is **Approaching Cap** or **At Cap**.
_Avoid_: Alert, one-time warning

**Employee Group**:
The recipient category used to choose the correct accrual notification wording and leave-request call to action.
_Avoid_: Template type, job bucket

**Faculty Academic**:
An **Employee Group** for fiscal-year academic appointee classifications, including academic administrators, coordinators, faculty, and researchers.
_Avoid_: Faculty only

**Staff**:
An **Employee Group** for staff-like classifications, including PSS, MSP, and SMG employees.
_Avoid_: Non-faculty

**Generic**:
An **Employee Group** used when an employee's classification does not map to a more specific accrual notification group.
_Avoid_: Unknown, unmapped

**Accrual Viewer Report**:
A monthly summary sent to active users who explicitly have the **Accrual Viewer** role.
_Avoid_: Admin report, manager report

**Accrual Viewer**:
A user role whose members can inspect accrual reporting and receive the monthly **Accrual Viewer Report**.
_Avoid_: Admin, viewer

**Person**:
A campus identity that may be associated with employee, student, external, and contact information. A **Person** is distinct from a Walter user account and from a project role such as Principal Investigator or Project Manager.
_Avoid_: Walter Person, Employee, User

**IAM ID**:
The stable campus identity identifier Walter uses when referring to a **Person** in navigation and client-facing person lookups.
_Avoid_: Employee ID, directory ID

**Employee ID**:
The employment identifier Walter uses to link a **Person** to financial and personnel data. Search eligibility follows the **Searchable Person** definition.
_Avoid_: IAM ID, public person identifier

**Searchable Person**:
A **Person** Walter can include in people search because they have both an **IAM ID** and an **Employee ID**.
_Avoid_: Directory user, employee-only result

## Relationships

- Walter refers to a **Person** by **IAM ID** in navigation and client-facing person lookups
- A **Person** can be displayed from downstream project or personnel data without being navigable when Walter cannot identify their **IAM ID**
- Project lookup can navigate to a **Person** only when Walter can identify their **IAM ID**
- People search includes **Searchable People**
- Admin user search also reads **Searchable People** from the imported People table, including its email address; it does not fall back to Entra directory search
- Admin permission operations require a current People record with an **Employee ID**
- Granting an admin-managed role resolves the selected **IAM ID** against Entra extensionAttribute7 and requires exactly one enabled member account; email domains do not determine eligibility
- Walter users and permissions remain keyed by Entra object ID, allowing grants before first login; reading and removing roles resolve the existing Walter user by **IAM ID** without Graph
- Admin grants save the selected People record's name, **Employee ID**, and nullable email to Walter; campus IAM supplies the Kerberos username. Missing email is not inferred from a login ID
- The [normal login profile refresh](web/server/Services/UserProfileOrchestrator.cs) can later replace these saved fields, including the email read by the **Accrual Viewer Report** recipient provider
- Missing or ambiguous Entra matches and conflicting existing account links block grants; imported identities can lag campus changes until the next successful People refresh
- An **Accrual Snapshot** classifies each employee as active, **Approaching Cap**, or **At Cap**
- An **Accrual Snapshot** identifies the employee recipient email for each employee row
- Employees who are **Approaching Cap** or **At Cap** are eligible for accrual notifications
- An **Accrual Notification** can be sent again in later months while the employee remains **Approaching Cap** or **At Cap**
- An **Accrual Notification** uses the recipient's **Employee Group** to choose the correct wording and leave-request call to action
- An employee receives at most one **Accrual Notification** for the same **Accrual Snapshot**
- An active **Accrual Viewer** receives the monthly **Accrual Viewer Report**
- A scheduled notification run does not create new **Accrual Notifications** when the latest **Accrual Snapshot** has already been notified
- Employees with unmapped classifications receive the **Generic** employee-group variant

## Example dialogue

> **Dev:** "Should we notify only employees whose balance is 100% of cap?"
> **Domain expert:** "No. Use the report's **At Cap** threshold, which starts at 96%, notify employees who are **Approaching Cap**, and send the **Accrual Notification** again each month while the risk remains."
>
> **Dev:** "Should admins receive the **Accrual Viewer Report** because they can view accrual pages?"
> **Domain expert:** "No. Only active users explicitly assigned the **Accrual Viewer** role receive it."

## Flagged ambiguities

- "At cap" can sound like exactly 100% of the cap; resolved: **At Cap** follows the report threshold and starts at 96%.
- Multiple accrual rows for the same employee can carry different emails; resolved: use the most recent non-empty employee email.
- "Faculty" can exclude academic researchers or coordinators; resolved: **Faculty Academic** includes fiscal-year academic appointee classifications used by the accrual report.
