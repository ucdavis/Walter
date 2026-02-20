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
GRANT EXECUTE ON [dbo].[usp_GetGLPPMReconciliation] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetGLTransactionListings] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetLaborLedgerData] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_GetPositionBudgets] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_HealthCheck_Connectivity] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_HealthCheck_RowCounts] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_HealthCheck_SchemaValidation] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_LogProcedureExecution] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_ParseProjectIdFilter] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_SanitizeInputString] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_ValidateAggieEnterpriseProject] TO [WalterAppRole];
GRANT EXECUTE ON [dbo].[usp_ValidateFinancialDept] TO [WalterAppRole];

PRINT 'Post-deployment complete.'