/*
Post-Deployment Script Template
--------------------------------------------------------------------------------------
 This file contains SQL statements that will be appended to the build script.
 Use SQLCMD syntax to include a file in the post-deployment script.
 Example:      :r .\myfile.sql
 Use SQLCMD syntax to reference a variable in the post-deployment script.
 Example:      :setvar TableName MyTable
               SELECT * FROM [$(TableName)]
--------------------------------------------------------------------------------------
*/

PRINT 'Applying post-deployment scripts...'
      
-- Grant permissions to application role
PRINT 'Granting WalterAppRole permissions...'
GRANT EXECUTE ON [dbo].[usp_GetFacultyDeptPortfolio] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetFacultyDeptPortfolioElzar] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetPPMProjectSummaryElzar] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetProjectSummary] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetGLProjectSummaryElzar] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetGLPPMReconciliation] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetGLTransactionListings] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetLaborLedgerData] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetCaesVacationAccrualBalanceSummaryReport] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetPositionBudgets] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetPositionBudgetsLocal] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetSearchablePeople] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_HealthCheck_Connectivity] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_HealthCheck_RowCounts] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_HealthCheck_SchemaValidation] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_LogProcedureExecution] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_ParseProjectIdFilter] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_SanitizeInputString] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_SwapStagingTable] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_ValidateAggieEnterpriseProject] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_ValidateFinancialDept] TO [WalterAppRole];

-- Grant application role permissions to tables
GRANT SELECT ON [dbo].[FacultyDeptPortfolio] TO [WalterAppRole];
GRANT SELECT ON [dbo].[EmployeeVacationAccrualBalances] TO [WalterAppRole];
GRANT SELECT ON [dbo].[PositionBudgets] TO [WalterAppRole];
GRANT SELECT ON [dbo].[Projects] TO [WalterAppRole];
GRANT SELECT ON [dbo].[People] TO [WalterAppRole];
GRANT SELECT ON [dbo].[PpmAwards] TO [WalterAppRole];
GRANT SELECT ON [dbo].[PpmPeople] TO [WalterAppRole];
GRANT SELECT ON [dbo].[PpmPersonRoles] TO [WalterAppRole];
GRANT SELECT ON [dbo].[PpmProjects] TO [WalterAppRole];
GRANT SELECT ON [dbo].[PpmProjectAwards] TO [WalterAppRole];

-- Grant pipeline role permissions
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[EmployeeVacationAccrualBalances] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[EmployeeVacationAccrualBalances_Staging] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[FacultyDeptPortfolio] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PositionBudgets] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PositionBudgets_Staging] TO [WalterPipelineRole];
GRANT EXECUTE ON [dbo].[usp_SwapPositionBudgets] TO [WalterPipelineRole];
GRANT EXECUTE ON [dbo].[usp_SwapStagingTable] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[Projects] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[People] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[People_Staging] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmAwards] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmPeople] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmPersonRoles] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmProjects] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmProjectAwards] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmAwards_Staging] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmPeople_Staging] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmPersonRoles_Staging] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmProjects_Staging] TO [WalterPipelineRole];
GRANT INSERT, SELECT, UPDATE, DELETE ON [dbo].[PpmProjectAwards_Staging] TO [WalterPipelineRole];



PRINT 'Post-deployment complete.'
