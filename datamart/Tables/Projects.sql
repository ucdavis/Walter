-- Local landing table for project code -> description lookups, plus the project
-- chartfield hierarchy (parent levels 0-5).
-- Replaces the Redshift OPENQUERY against ae_dwh.erp_project (UCD Project segment values)
-- used by usp_GetPositionBudgets. Populated via ETL; consumed by usp_GetPositionBudgetsLocal.
create table dbo.Projects
(
    Code             nvarchar(15)  not null,
    ValueId          int,
    Description      nvarchar(255),
    ParentLevel0Code nvarchar(15),
    ParentLevel1Code nvarchar(15),
    ParentLevel2Code nvarchar(15),
    ParentLevel3Code nvarchar(15),
    ParentLevel4Code nvarchar(15),
    ParentLevel5Code nvarchar(15),
    LoadedAt         datetime2(3)  not null,
    constraint PK_Projects
        primary key (Code)
)
go
