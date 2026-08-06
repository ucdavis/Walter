-- Unified chart-of-accounts segment dimension: one row per segment value across all eight
-- Aggie Enterprise CoA segments (Entity, Fund, Financial Department, Account, Purpose,
-- Program, Project, Activity). Sourced from ae_dwh.erp_* by the Fabric pl_aedwh_loader
-- pipeline (bronze -> silver union -> upsert here on SegmentName, Code). Codes retired
-- from source linger, same accepted behavior as dbo.Projects; Projects also remains the
-- richer project-specific dimension.
create table dbo.ChartStringSegment
(
    SegmentName      nvarchar(120) not null,  -- source segment_name, e.g. 'UCD Project'
    Code             nvarchar(15)  not null,  -- segment value code; unique within a segment
    Description      nvarchar(255) null,
    HierarchyDepth   int           null,
    ParentLevel0Code nvarchar(15)  null,      -- topmost rollup
    ParentLevel1Code nvarchar(15)  null,
    ParentLevel2Code nvarchar(15)  null,
    ParentLevel3Code nvarchar(15)  null,
    ParentLevel4Code nvarchar(15)  null,      -- nearest parent above the leaf
    ParentLevel5Code nvarchar(15)  null,
    LoadedAt         datetime2(3)  not null,
    constraint PK_ChartStringSegment
        primary key (SegmentName, Code)
)
go
