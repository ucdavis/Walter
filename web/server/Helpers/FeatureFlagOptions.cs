namespace server.Helpers;

/// <summary>
/// Environment feature flags, bound from the "FeatureFlags" configuration section. These gate
/// optional features per environment (set via appsettings or an Azure App Setting, e.g. env
/// FeatureFlags__BurndownEnabled). UI flags are surfaced to the SPA via GET /api/system/features.
/// </summary>
public sealed class FeatureFlagOptions
{
    public const string SectionName = "FeatureFlags";

    /// <summary>Keep legacy GraphQL reads by default; false uses the imported datamart snapshot for search, portfolios, authorization, and login/emulation role synchronization.</summary>
    public bool UseGraphQLAPI { get; set; } = true;

    /// <summary>Whether the project burndown feature is exposed in the UI.</summary>
    public bool BurndownEnabled { get; set; }

    /// <summary>Whether the expenditure progress feature is exposed in the UI.</summary>
    public bool ExpenditureProgressEnabled { get; set; }

    /// <summary>Whether the project costs preview is exposed in the UI.</summary>
    public bool ProjectCostsEnabled { get; set; }
}
