# GL Reconciliation Inclusions Admin Console

**Issue:** [#310](https://github.com/ucdavis/Walter/issues/310)  
**Date:** 2026-06-12

## Problem

GL/PPM reconciliation excludes all 3XXXXXX natural-account activity. Specific transactions are re-included via a hardcoded `ACCOUNTING_SEQUENCE_NUMBER` list baked into two sprocs that must stay in sync. Every addition requires a code change deployed to both. More ASNs are expected over time.

## Constraints

- The datamart DB is **read-only from the app** — all datamart writes go through the ADF pipeline. This must stay true.
- The web app has full read/write access to AppDb (EF).
- Non-technical users need to manage the list without code deployments.
- Only the flat (unscoped) ASN list moves to the table. The Jul-23 period-scoped ASNs and the Apr-24 UCD Conversion source/category rule stay hardcoded in the sprocs.

## Approach

Store the inclusion list in AppDb (EF). The sprocs accept it as a parameter (`@IncludedASNs`) — same pattern as `@ProjectIds`. The GL controller fetches the list from AppDb and passes it through. The datamart stays read-only from the app.

---

## Database (datamart)

**No new table. No new grants.**

Both sprocs (`usp_GetGLPPMReconciliation`, `usp_GetGLTransactionListings`) gain a new optional parameter:

```sql
@IncludedASNs NVARCHAR(MAX) = NULL
```

Before building `@RedshiftQuery`, the sproc checks the parameter:
- If NULL or empty, use a sentinel that never matches (e.g., `''-1''`) so the `IN` clause stays syntactically valid.
- Otherwise inject the provided comma-separated, double-quoted list (e.g., `''173421'',''288176''`) directly into the OPENQUERY template in place of the hardcoded list.

The sproc does **not** validate ASN values — that is the API's responsibility. The format of `@IncludedASNs` is controlled entirely by DatamartService.

---

## AppDb (EF)

**New entity: `GLReconciliationInclusion`**

| Column | Type | Notes |
|--------|------|-------|
| `AccountingSequenceNumber` | `string` | PK; digits only, 1–20 chars |
| `Note` | `string?` | Optional label |
| `CreatedBy` | `string` | Entra user ID (GUID string) |
| `CreatedOn` | `DateTime` | UTC, set on insert |

New `DbSet<GLReconciliationInclusion>` on `AppDbContext`. Standard EF migration.

**New service: `IGLReconciliationInclusionsService`**

```csharp
Task<IReadOnlyList<GLReconciliationInclusion>> GetInclusionsAsync(CancellationToken ct);
Task<GLReconciliationInclusion> AddInclusionAsync(string asn, string? note, string createdBy, CancellationToken ct);
Task<bool> RemoveInclusionAsync(string asn, CancellationToken ct);
```

`AddInclusionAsync` validates ASN is digits-only (1–20 chars) and throws `InvalidOperationException` on duplicate. `RemoveInclusionAsync` returns false if not found. Backed by EF AppDb. Registered in DI.

---

## API

**New controller: `AdminGLReconciliationInclusionsController`**

Route: `api/admin/gl-reconciliation-inclusions`  
Auth: `[Authorize(Policy = AuthorizationHelper.Policies.IsManager)]` — `AdminBypassHandler` grants Admin role access automatically.

| Method | Route | Body | Response |
|--------|-------|------|----------|
| GET | `/` | — | `GLReconciliationInclusion[]` |
| POST | `/` | `{ accountingSequenceNumber, note? }` | `GLReconciliationInclusion` |
| DELETE | `/{asn}` | — | 204 / 404 |

`POST` validates numeric format (digits only, 1–20 chars) before calling the service. `CreatedBy` is set from `User.GetObjectId()`. Returns 409 on duplicate.

**DatamartService — updated GL methods**

`GetGLPPMReconciliationAsync` and `GetGLTransactionListingsAsync` gain a new optional parameter:

```csharp
IEnumerable<string>? includedAsns = null
```

DatamartService formats the list as `''asn1'',''asn2'',...` (double-quoted for the OPENQUERY template) and passes it as `@IncludedASNs`. If the list is null or empty, passes `NULL` (sproc uses sentinel).

**ProjectController — wiring**

`ProjectController` already injects `IDatamartService`. It also receives `IGLReconciliationInclusionsService` (new constructor param). Before calling either GL method, it fetches `await _inclusionsService.GetInclusionsAsync(ct)` and passes the ASN strings through.

---

## UI

**`roleAccess.ts`**

New exported function:
```ts
export const canAccessAdminGLInclusions = (roles: readonly string[]) =>
  hasRole(roles, ELEVATED_ROLES); // Admin + Manager
```

**New page: `routes/(authenticated)/admin/gl-inclusions.tsx`**

- `beforeLoad`: redirect to `/admin` if `!canAccessAdminGLInclusions(user.roles)`
- Fetches inclusion list on load
- Table: ASN, Note, Added By (Entra ID), Added On, Remove button per row
- Add form: ASN text input + optional note + Add button
- Client-side numeric validation before submit (digits only, non-empty)
- Error/success feedback inline

**Admin index (`admin/index.tsx`)**

Add link to `/admin/gl-inclusions` visible when `canAccessAdminGLInclusions`.

**New query file: `queries/adminGLInclusions.ts`**

- `useGLInclusionsQuery()` — fetches list, standard invalidation on mutation
- `addGLInclusion({ accountingSequenceNumber, note? })` — mutation fn
- `removeGLInclusion(asn)` — mutation fn

---

## What stays hardcoded in both sprocs

```sql
OR (tlr.PERIOD_NAME = ''Jul-23'' AND tlr.ACCOUNTING_SEQUENCE_NUMBER IN (''100009'',''100010'',''100307'',''103283'',''103284''))
OR (tlr.PERIOD_NAME = ''Apr-24'' AND tlr.JOURNAL_SOURCE = ''UCD Conversion'' AND tlr.JOURNAL_CATEGORY = ''UCD Conversion'')
```

Only the flat unscoped list moves to the table/parameter.

---

## Out of scope

- Validating that an ASN exists in GL data — a wrong ASN matches nothing; easy to delete.
- Seeding the 12 current ASNs — user will seed outside of deployment.
- Editing in place — fix a typo by delete + re-add.
