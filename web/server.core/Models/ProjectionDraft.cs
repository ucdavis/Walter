using server.core.Domain;

namespace server.core.Models;

/// <summary>Editable scenario inputs before persistence; excludes saved identity, audit, ownership, and retry metadata.</summary>
public sealed record ProjectionDraft(
    string Name,
    int HistoryMonths,
    DateTime SeededAt,
    List<ProjectionFundingSource> FundingSources,
    List<ProjectionAppointment> Appointments);

/// <summary>Initial roster provenance used only while selecting a new plan's funding sources.</summary>
public sealed record ProjectionRosterEntry(int AppointmentId, List<string> ProjectNumbers);

/// <summary>Fresh editable inputs and setup-only roster provenance; reading this response creates no saved plan.</summary>
public sealed record ProjectionSeedResponse(ProjectionDraft Draft, List<ProjectionRosterEntry> Roster);
