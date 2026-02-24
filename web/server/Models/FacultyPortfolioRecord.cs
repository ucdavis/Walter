using System.Text.Json.Serialization;

namespace server.Models;

/// <summary>
/// Maps output from usp_GetFacultyDeptPortfolio stored procedure.
/// </summary>
public sealed class FacultyPortfolioRecord
{
    [JsonPropertyName("awardNumber")]
    public string? AwardNumber { get; set; }

    [JsonPropertyName("awardStartDate")]
    public DateTime? AwardStartDate { get; set; }

    [JsonPropertyName("awardEndDate")]
    public DateTime? AwardEndDate { get; set; }

    [JsonPropertyName("projectNumber")]
    public string ProjectNumber { get; set; } = "";

    [JsonPropertyName("projectName")]
    public string? ProjectName { get; set; }

    [JsonPropertyName("projectType")]
    public string? ProjectType { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName
    {
        get
        {
            var projectName = ProjectName ?? "";
            var cleanedName = string.IsNullOrEmpty(ProjectNumber)
                ? projectName.Trim()
                : projectName.Replace(ProjectNumber, "").Trim();
            var name = cleanedName;
            if (ProjectType == "Internal" && !string.IsNullOrEmpty(TaskName))
                name += $" - {TaskName}";
            return name;
        }
    }

    [JsonPropertyName("projectOwningOrg")]
    public string? ProjectOwningOrg { get; set; }

    [JsonPropertyName("projectStatusCode")]
    public string? ProjectStatus { get; set; }

    [JsonPropertyName("taskNum")]
    public string? TaskNum { get; set; }

    [JsonPropertyName("taskName")]
    public string? TaskName { get; set; }

    [JsonPropertyName("taskStatus")]
    public string? TaskStatus { get; set; }

    [JsonPropertyName("pm")]
    public string? Pm { get; set; }

    [JsonPropertyName("pa")]
    public string? Pa { get; set; }

    [JsonPropertyName("pi")]
    public string? Pi { get; set; }

    [JsonPropertyName("copi")]
    public string? Copi { get; set; }

    [JsonPropertyName("expenditureCategoryName")]
    public string? ExpenditureCategoryName { get; set; }

    [JsonPropertyName("fundCode")]
    public string? FundCode { get; set; }

    [JsonPropertyName("fundDesc")]
    public string? FundDesc { get; set; }

    [JsonPropertyName("purposeCode")]
    public string? PurposeCode { get; set; }

    [JsonPropertyName("purposeDesc")]
    public string? PurposeDesc { get; set; }

    [JsonPropertyName("programCode")]
    public string? ProgramCode { get; set; }

    [JsonPropertyName("programDesc")]
    public string? ProgramDesc { get; set; }

    [JsonPropertyName("activityCode")]
    public string? ActivityCode { get; set; }

    [JsonPropertyName("activityDesc")]
    public string? ActivityDesc { get; set; }

    [JsonPropertyName("catBudget")]
    public decimal CatBudget { get; set; }

    [JsonPropertyName("catCommitments")]
    public decimal CatCommitments { get; set; }

    [JsonPropertyName("catItdExp")]
    public decimal CatItdExp { get; set; }

    [JsonPropertyName("catBudBal")]
    public decimal CatBudBal { get; set; }

    [JsonPropertyName("awardStatus")]
    public string? AwardStatus { get; set; }

    [JsonPropertyName("awardType")]
    public string? AwardType { get; set; }

    [JsonPropertyName("awardCloseDate")]
    public string? AwardCloseDate { get; set; }

    [JsonPropertyName("awardPi")]
    public string? AwardPi { get; set; }

    [JsonPropertyName("billingCycle")]
    public string? BillingCycle { get; set; }

    [JsonPropertyName("projectBurdenScheduleBase")]
    public string? ProjectBurdenScheduleBase { get; set; }

    [JsonPropertyName("projectBurdenCostRate")]
    public string? ProjectBurdenCostRate { get; set; }

    [JsonPropertyName("costShareRequiredBySponsor")]
    public string? CostShareRequiredBySponsor { get; set; }

    [JsonPropertyName("grantAdministrator")]
    public string? GrantAdministrator { get; set; }

    [JsonPropertyName("postReportingPeriod")]
    public string? PostReportingPeriod { get; set; }

    [JsonPropertyName("primarySponsorName")]
    public string? PrimarySponsorName { get; set; }

    [JsonPropertyName("projectFund")]
    public string? ProjectFund { get; set; }

    [JsonPropertyName("contractAdministrator")]
    public string? ContractAdministrator { get; set; }

    [JsonPropertyName("sponsorAwardNumber")]
    public string? SponsorAwardNumber { get; set; }

    /// <summary>
    /// Project Manager employee ID (from Financial Service API).
    /// </summary>
    [JsonPropertyName("pmEmployeeId")]
    public string? PmEmployeeId { get; set; }
}