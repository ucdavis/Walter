using System.Text.Json.Serialization;
using server.core.Domain;

namespace server.core.Models;

/// <summary>Editable scenario inputs before persistence; excludes saved identity, audit, ownership, and retry metadata.</summary>
public sealed record ProjectionDraft(
    string Name,
    DateTime SeededAt,
    [property: JsonRequired] ProjectionContent Content);

/// <summary>Exact matched task provenance used only while selecting a new plan's funding sources.</summary>
public sealed record ProjectionRosterEntry(int AppointmentId, List<int> FundingSourceIds);

/// <summary>Fresh editable inputs and setup-only roster provenance; reading this response creates no saved plan.</summary>
public sealed record ProjectionSeedResponse(ProjectionDraft Draft, List<ProjectionRosterEntry> Roster);
