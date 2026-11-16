namespace server.Helpers;

public static class UiFeatureNames
{
    public const string Burndown = "walter.BurndownEnabled";
    public const string ExpenditureProgress = "walter.ExpenditureProgressEnabled";
    public const string ProjectCosts = "walter.ProjectCostsEnabled";
    public const string Projections = "walter.ProjectionsEnabled";

    public static readonly IReadOnlyDictionary<string, string> LegacyNames = new Dictionary<string, string>
    {
        [nameof(FeatureFlagOptions.BurndownEnabled)] = Burndown,
        [nameof(FeatureFlagOptions.ExpenditureProgressEnabled)] = ExpenditureProgress,
        [nameof(FeatureFlagOptions.ProjectCostsEnabled)] = ProjectCosts,
        [nameof(FeatureFlagOptions.ProjectionsEnabled)] = Projections,
    };
}
