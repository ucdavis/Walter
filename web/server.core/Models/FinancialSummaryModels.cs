using System.Text.Json.Serialization;

namespace server.core.Models;

/// <summary>
/// One grouped row from usp_GetGlSegmentSummary. Only the dimensions selected for the query are
/// populated; the rest stay null (Dapper leaves columns absent from the dynamic result set at default).
/// </summary>
public sealed class FinancialSummaryRow
{
    [JsonPropertyName("financialDeptDCode")] public string? FinancialDeptDCode { get; set; }
    [JsonPropertyName("financialDeptDName")] public string? FinancialDeptDName { get; set; }
    [JsonPropertyName("financialDeptECode")] public string? FinancialDeptECode { get; set; }
    [JsonPropertyName("financialDeptEName")] public string? FinancialDeptEName { get; set; }
    [JsonPropertyName("financialDeptFCode")] public string? FinancialDeptFCode { get; set; }
    [JsonPropertyName("financialDeptFName")] public string? FinancialDeptFName { get; set; }
    [JsonPropertyName("financialDeptGCode")] public string? FinancialDeptGCode { get; set; }
    [JsonPropertyName("financialDeptGName")] public string? FinancialDeptGName { get; set; }
    [JsonPropertyName("fund")] public string? Fund { get; set; }
    [JsonPropertyName("fundName")] public string? FundName { get; set; }
    [JsonPropertyName("program")] public string? Program { get; set; }
    [JsonPropertyName("programName")] public string? ProgramName { get; set; }
    [JsonPropertyName("activity")] public string? Activity { get; set; }
    [JsonPropertyName("activityName")] public string? ActivityName { get; set; }
    [JsonPropertyName("project")] public string? Project { get; set; }
    [JsonPropertyName("projectName")] public string? ProjectName { get; set; }
    [JsonPropertyName("naturalAccount")] public string? NaturalAccount { get; set; }
    [JsonPropertyName("naturalAccountName")] public string? NaturalAccountName { get; set; }

    [JsonPropertyName("income")] public decimal Income { get; set; }
    [JsonPropertyName("expense")] public decimal Expense { get; set; }
    [JsonPropertyName("net")] public decimal Net { get; set; }
}

/// <summary>One picker option from usp_GetGlSegmentSummaryFilterOptions.</summary>
public sealed class FinancialSummaryOption
{
    [JsonPropertyName("code")] public string Code { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    /// <summary>Department level D-G for the FinancialDept facet; null otherwise.</summary>
    [JsonPropertyName("level")] public string? Level { get; set; }
    /// <summary>Chronological sort key for Period ('YYYY-MM') / FiscalYear; null otherwise.</summary>
    [JsonPropertyName("sortKey")] public string? SortKey { get; set; }
}

/// <summary>POST body for the grouped summary query.</summary>
public sealed class FinancialSummaryQuery
{
    public string[] Dimensions { get; set; } = Array.Empty<string>();
    public string[]? FinancialDepartments { get; set; }
    public string[]? Funds { get; set; }
    public string[]? Programs { get; set; }
    public string[]? Activities { get; set; }
    public string[]? Projects { get; set; }
    public string[]? NaturalAccounts { get; set; }
    public string[]? FiscalYears { get; set; }
    public string[]? Periods { get; set; }
}

/// <summary>POST body for a single picker's options.</summary>
public sealed class FinancialSummaryOptionsQuery
{
    public string Segment { get; set; } = "";
    public string[]? FinancialDepartments { get; set; }
    public string[]? Funds { get; set; }
    public string[]? Programs { get; set; }
    public string[]? Activities { get; set; }
    public string[]? Projects { get; set; }
    public string[]? NaturalAccounts { get; set; }
    public string[]? FiscalYears { get; set; }
    public string[]? Periods { get; set; }
}
