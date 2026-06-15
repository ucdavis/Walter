-- Staging table for dbo.GlProjectMonthlyActuals. The AE_DWH copy job fully loads this table,
-- then dbo.usp_SwapStagingTable snapshot-swaps it into the final table in one transaction so
-- readers never see a partially loaded GL set. Columns and nullability must match the final
-- table exactly (the swap's schema-compatibility check enforces this); the PK is intentionally
-- omitted.
create table dbo.GlProjectMonthlyActuals_Staging
(
    ProjectId        nvarchar(15)   not null,
    PeriodName       nvarchar(15)   not null,
    NaturalAccount   nvarchar(10)   not null,
    ParentLevel0Code nvarchar(15),
    ActualAmount     decimal(18, 2) not null,
    LoadedAt         datetime2(3)   not null
)
go
