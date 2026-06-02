namespace server.core.Services;

public sealed class PositionBudgetsOptions
{
    public const string SectionName = "PositionBudgets";

    /// <summary>Live UCPath data warehouse via Oracle linked server (dbo.usp_GetPositionBudgets).</summary>
    public const string UCPathDWHSource = "UCPathDWH";

    /// <summary>Local ETL-populated dbo.PositionBudgets table (dbo.usp_GetPositionBudgetsLocal).</summary>
    public const string LocalSource = "Local";

    /// <summary>
    /// Which backing source position budgets are read from. Defaults to the live UCPath
    /// data warehouse; override per-environment (e.g. PositionBudgets__Source=Local) to cut
    /// over to the local table.
    /// </summary>
    public string Source { get; set; } = UCPathDWHSource;

    public bool UseLocalTable =>
        string.Equals(Source?.Trim(), LocalSource, StringComparison.OrdinalIgnoreCase);
}
