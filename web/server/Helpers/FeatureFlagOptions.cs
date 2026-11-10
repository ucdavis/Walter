namespace server.Helpers;

/// <summary>
/// Backend rollout settings and legacy UI defaults bound from "FeatureFlags". The UI values
/// seed Microsoft Feature Management only when no Azure App Configuration endpoint is configured.
/// </summary>
public sealed class FeatureFlagOptions
{
    public const string SectionName = "FeatureFlags";

    /// <summary>
    /// Uses legacy AE GraphQL PPM reads by default. False uses imported datamart data for
    /// project search, portfolios, authorization, and PM role synchronization during
    /// login or new-user emulation provisioning.
    /// </summary>
    public bool UseGraphQLAPI { get; set; } = true;

    /// <summary>Whether the project burndown feature is exposed in the UI.</summary>
    public bool BurndownEnabled { get; set; }

    /// <summary>Whether the expenditure progress feature is exposed in the UI.</summary>
    public bool ExpenditureProgressEnabled { get; set; }

    /// <summary>Whether the project costs preview is exposed in the UI.</summary>
    public bool ProjectCostsEnabled { get; set; }

    /// <summary>Whether the PI projections pages are exposed in the UI. The API is not gated.</summary>
    public bool ProjectionsEnabled { get; set; }
}
