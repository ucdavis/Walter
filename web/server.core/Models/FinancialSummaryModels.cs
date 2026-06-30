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

    // Flattened chart-string ancestor levels (0 = top rollup .. 5 = nearest parent), joined from the
    // dbo.Erp*Hierarchy dimensions. Only populated for the levels selected as group-by dimensions.
    [JsonPropertyName("fundParentLevel0Code")] public string? FundParentLevel0Code { get; set; }
    [JsonPropertyName("fundParentLevel0Name")] public string? FundParentLevel0Name { get; set; }
    [JsonPropertyName("fundParentLevel1Code")] public string? FundParentLevel1Code { get; set; }
    [JsonPropertyName("fundParentLevel1Name")] public string? FundParentLevel1Name { get; set; }
    [JsonPropertyName("fundParentLevel2Code")] public string? FundParentLevel2Code { get; set; }
    [JsonPropertyName("fundParentLevel2Name")] public string? FundParentLevel2Name { get; set; }
    [JsonPropertyName("fundParentLevel3Code")] public string? FundParentLevel3Code { get; set; }
    [JsonPropertyName("fundParentLevel3Name")] public string? FundParentLevel3Name { get; set; }
    [JsonPropertyName("fundParentLevel4Code")] public string? FundParentLevel4Code { get; set; }
    [JsonPropertyName("fundParentLevel4Name")] public string? FundParentLevel4Name { get; set; }
    [JsonPropertyName("fundParentLevel5Code")] public string? FundParentLevel5Code { get; set; }
    [JsonPropertyName("fundParentLevel5Name")] public string? FundParentLevel5Name { get; set; }
    [JsonPropertyName("activityParentLevel0Code")] public string? ActivityParentLevel0Code { get; set; }
    [JsonPropertyName("activityParentLevel0Name")] public string? ActivityParentLevel0Name { get; set; }
    [JsonPropertyName("activityParentLevel1Code")] public string? ActivityParentLevel1Code { get; set; }
    [JsonPropertyName("activityParentLevel1Name")] public string? ActivityParentLevel1Name { get; set; }
    [JsonPropertyName("activityParentLevel2Code")] public string? ActivityParentLevel2Code { get; set; }
    [JsonPropertyName("activityParentLevel2Name")] public string? ActivityParentLevel2Name { get; set; }
    [JsonPropertyName("activityParentLevel3Code")] public string? ActivityParentLevel3Code { get; set; }
    [JsonPropertyName("activityParentLevel3Name")] public string? ActivityParentLevel3Name { get; set; }
    [JsonPropertyName("activityParentLevel4Code")] public string? ActivityParentLevel4Code { get; set; }
    [JsonPropertyName("activityParentLevel4Name")] public string? ActivityParentLevel4Name { get; set; }
    [JsonPropertyName("activityParentLevel5Code")] public string? ActivityParentLevel5Code { get; set; }
    [JsonPropertyName("activityParentLevel5Name")] public string? ActivityParentLevel5Name { get; set; }
    [JsonPropertyName("naturalAccountParentLevel0Code")] public string? NaturalAccountParentLevel0Code { get; set; }
    [JsonPropertyName("naturalAccountParentLevel0Name")] public string? NaturalAccountParentLevel0Name { get; set; }
    [JsonPropertyName("naturalAccountParentLevel1Code")] public string? NaturalAccountParentLevel1Code { get; set; }
    [JsonPropertyName("naturalAccountParentLevel1Name")] public string? NaturalAccountParentLevel1Name { get; set; }
    [JsonPropertyName("naturalAccountParentLevel2Code")] public string? NaturalAccountParentLevel2Code { get; set; }
    [JsonPropertyName("naturalAccountParentLevel2Name")] public string? NaturalAccountParentLevel2Name { get; set; }
    [JsonPropertyName("naturalAccountParentLevel3Code")] public string? NaturalAccountParentLevel3Code { get; set; }
    [JsonPropertyName("naturalAccountParentLevel3Name")] public string? NaturalAccountParentLevel3Name { get; set; }
    [JsonPropertyName("naturalAccountParentLevel4Code")] public string? NaturalAccountParentLevel4Code { get; set; }
    [JsonPropertyName("naturalAccountParentLevel4Name")] public string? NaturalAccountParentLevel4Name { get; set; }
    [JsonPropertyName("naturalAccountParentLevel5Code")] public string? NaturalAccountParentLevel5Code { get; set; }
    [JsonPropertyName("naturalAccountParentLevel5Name")] public string? NaturalAccountParentLevel5Name { get; set; }

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
