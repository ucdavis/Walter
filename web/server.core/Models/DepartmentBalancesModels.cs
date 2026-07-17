using System.Text.Json.Serialization;

namespace server.core.Models;

/// <summary>
/// One grouped row from usp_GetGlBalanceSummary. Only the dimensions selected for the query are
/// populated; the rest stay null (Dapper leaves columns absent from the dynamic result set at default).
/// </summary>
public sealed class DepartmentBalanceRow
{
    [JsonPropertyName("dept")] public string? Dept { get; set; }
    [JsonPropertyName("deptDesc")] public string? DeptDesc { get; set; }
    [JsonPropertyName("fund")] public string? Fund { get; set; }
    [JsonPropertyName("fundDesc")] public string? FundDesc { get; set; }
    [JsonPropertyName("account")] public string? Account { get; set; }
    [JsonPropertyName("accountDesc")] public string? AccountDesc { get; set; }
    [JsonPropertyName("purpose")] public string? Purpose { get; set; }
    [JsonPropertyName("purposeDesc")] public string? PurposeDesc { get; set; }
    [JsonPropertyName("project")] public string? Project { get; set; }
    [JsonPropertyName("projectDesc")] public string? ProjectDesc { get; set; }
    [JsonPropertyName("activity")] public string? Activity { get; set; }
    [JsonPropertyName("activityDesc")] public string? ActivityDesc { get; set; }

    /// <summary>The snapshot's accounting period ("balances as of"); always populated.</summary>
    [JsonPropertyName("periodName")] public string? PeriodName { get; set; }

    [JsonPropertyName("assets")] public decimal Assets { get; set; }
    [JsonPropertyName("liabilities")] public decimal Liabilities { get; set; }
    [JsonPropertyName("netPosition")] public decimal NetPosition { get; set; }
    [JsonPropertyName("revenue")] public decimal Revenue { get; set; }
    [JsonPropertyName("expenses")] public decimal Expenses { get; set; }
    [JsonPropertyName("endingBalance")] public decimal EndingBalance { get; set; }
}

/// <summary>One picker option from usp_GetGlBalanceSummaryFilterOptions.</summary>
public sealed class DepartmentBalanceOption
{
    [JsonPropertyName("code")] public string Code { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    /// <summary>Hierarchy level for Dept/Fund/Account facets: "Leaf" or "0".."5" (0 = top rollup); null otherwise.</summary>
    [JsonPropertyName("level")] public string? Level { get; set; }
}

/// <summary>POST body for the grouped summary query.</summary>
public sealed class DepartmentBalancesQuery
{
    public string[] Dimensions { get; set; } = Array.Empty<string>();
    public string[]? FinancialDepartments { get; set; }
    public string[]? Funds { get; set; }
    public string[]? Accounts { get; set; }
    public string[]? Purposes { get; set; }
    public string[]? Projects { get; set; }
    public string[]? Activities { get; set; }
}

/// <summary>POST body for a single picker's options.</summary>
public sealed class DepartmentBalancesOptionsQuery
{
    public string Segment { get; set; } = "";
    public string[]? FinancialDepartments { get; set; }
    public string[]? Funds { get; set; }
    public string[]? Accounts { get; set; }
    public string[]? Purposes { get; set; }
    public string[]? Projects { get; set; }
    public string[]? Activities { get; set; }
}
