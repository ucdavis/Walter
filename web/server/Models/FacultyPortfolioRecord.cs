using System.Text.Json.Serialization;

namespace server.Models;

/// <summary>
/// Maps output from usp_GetFacultyDeptPortfolio stored procedure.
/// </summary>
public sealed record FacultyPortfolioRecord(
    [property: JsonPropertyName("awardNumber")] string? AwardNumber,
    [property: JsonPropertyName("awardStartDate")] DateTime? AwardStartDate,
    [property: JsonPropertyName("awardEndDate")] DateTime? AwardEndDate,
    [property: JsonPropertyName("projectNumber")] string ProjectNumber,
    [property: JsonPropertyName("projectName")] string? ProjectName,
    [property: JsonPropertyName("projectOwningOrg")] string? ProjectOwningOrg,
    [property: JsonPropertyName("projectStatusCode")] string? ProjectStatus,
    [property: JsonPropertyName("taskNum")] string? TaskNum,
    [property: JsonPropertyName("taskName")] string? TaskName,
    [property: JsonPropertyName("taskStatus")] string? TaskStatus,
    [property: JsonPropertyName("pm")] string? Pm,
    [property: JsonPropertyName("pa")] string? Pa,
    [property: JsonPropertyName("pi")] string? Pi,
    [property: JsonPropertyName("copi")] string? Copi,
    [property: JsonPropertyName("expenditureCategoryName")] string? ExpenditureCategoryName,
    [property: JsonPropertyName("fundDesc")] string? FundDesc,
    [property: JsonPropertyName("purposeDesc")] string? PurposeDesc,
    [property: JsonPropertyName("programDesc")] string? ProgramDesc,
    [property: JsonPropertyName("activityDesc")] string? ActivityDesc,
    [property: JsonPropertyName("catBudget")] decimal CatBudget,
    [property: JsonPropertyName("catCommitments")] decimal CatCommitments,
    [property: JsonPropertyName("catItdExp")] decimal CatItdExp,
    [property: JsonPropertyName("catBudBal")] decimal CatBudBal
);