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

    public bool BurndownEnabled { get; set; }

    public bool ExpenditureProgressEnabled { get; set; }

    public bool ProjectCostsEnabled { get; set; }

    public bool ProjectionsEnabled { get; set; }
}
