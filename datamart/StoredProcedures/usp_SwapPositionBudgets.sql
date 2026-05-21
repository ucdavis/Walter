create procedure dbo.usp_SwapPositionBudgets
as
begin
    set nocount on;
    set xact_abort on;

    begin transaction;

    merge dbo.PositionBudgets as target
    using dbo.PositionBudgets_Staging as source
        on target.PositionNumber = source.PositionNumber
       and target.AccountCode    = source.AccountCode
    when matched then
        update set
            College              = source.College,
            FiscalYear           = source.FiscalYear,
            DistributionPercent  = source.DistributionPercent,
            FundingEndDate       = source.FundingEndDate,
            FundingEffectiveDate = source.FundingEffectiveDate,
            UcPercentPay         = source.UcPercentPay,
            NaturalAccount       = source.NaturalAccount,
            FinancialDept        = source.FinancialDept,
            ProjectId            = source.ProjectId,
            Task                 = source.Task,
            FundCode             = source.FundCode,
            ProgramCode          = source.ProgramCode,
            Purpose              = source.Purpose,
            Activity             = source.Activity,
            Award                = source.Award,
            JobEffectiveDate     = source.JobEffectiveDate,
            JobEffectiveSequence = source.JobEffectiveSequence,
            EmployeeId           = source.EmployeeId,
            MonthlyRate          = source.MonthlyRate,
            ExpectedEndDate      = source.ExpectedEndDate,
            Fte                  = source.Fte,
            CompFrequency        = source.CompFrequency,
            TerminationDate      = source.TerminationDate,
            Name                 = source.Name,
            PositionDescription  = source.PositionDescription,
            JobCode              = source.JobCode,
            LoadedAt             = source.LoadedAt
    when not matched by target then
        insert
        (
            College, FiscalYear, PositionNumber, AccountCode, DistributionPercent,
            FundingEndDate, FundingEffectiveDate, UcPercentPay, NaturalAccount, FinancialDept,
            ProjectId, Task, FundCode, ProgramCode, Purpose,
            Activity, Award, JobEffectiveDate, JobEffectiveSequence, EmployeeId,
            MonthlyRate, ExpectedEndDate, Fte, CompFrequency, TerminationDate,
            Name, PositionDescription, JobCode, LoadedAt
        )
        values
        (
            source.College, source.FiscalYear, source.PositionNumber, source.AccountCode, source.DistributionPercent,
            source.FundingEndDate, source.FundingEffectiveDate, source.UcPercentPay, source.NaturalAccount, source.FinancialDept,
            source.ProjectId, source.Task, source.FundCode, source.ProgramCode, source.Purpose,
            source.Activity, source.Award, source.JobEffectiveDate, source.JobEffectiveSequence, source.EmployeeId,
            source.MonthlyRate, source.ExpectedEndDate, source.Fte, source.CompFrequency, source.TerminationDate,
            source.Name, source.PositionDescription, source.JobCode, source.LoadedAt
        )
    when not matched by source then
        delete;

    commit transaction;
end
go
