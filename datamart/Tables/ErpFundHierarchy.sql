-- Flattened Fund segment hierarchy for the college/department financial summary report. One row per
-- leaf fund value (Code), carrying the segment's six ancestor rollup levels denormalized as code+name
-- pairs (ParentLevel0 = topmost rollup ... ParentLevel5 = nearest parent above the leaf). Sourced from
-- Aggie Enterprise ae_dwh.erp_fund; the parent *names* are resolved by self-joining erp_fund on
-- code = parent_level_N_code (the source exposes parent codes only). Joined by usp_GetGlSegmentSummary
-- and usp_GetGlSegmentSummaryFilterOptions to GlSegmentMonthlyActuals.Fund for hierarchy-aware
-- filter/group-by. Populated out-of-band for now; an ADF pipeline will maintain it later.
create table dbo.ErpFundHierarchy
(
    Code             varchar(20)    not null,  -- leaf fund value; join key to GlSegmentMonthlyActuals.Fund
    Description      nvarchar(1000) null,      -- leaf fund description (erp_fund.description)
    ParentLevel0Code varchar(20)    null,      -- topmost rollup
    ParentLevel0Name nvarchar(1000) null,
    ParentLevel1Code varchar(20)    null,
    ParentLevel1Name nvarchar(1000) null,
    ParentLevel2Code varchar(20)    null,
    ParentLevel2Name nvarchar(1000) null,
    ParentLevel3Code varchar(20)    null,
    ParentLevel3Name nvarchar(1000) null,
    ParentLevel4Code varchar(20)    null,
    ParentLevel4Name nvarchar(1000) null,
    ParentLevel5Code varchar(20)    null,      -- nearest parent above the leaf
    ParentLevel5Name nvarchar(1000) null,
    LoadedAt         datetime2(3)   not null constraint DF_ErpFundHierarchy_LoadedAt default (sysutcdatetime()),
    constraint PK_ErpFundHierarchy primary key clustered (Code)
)
go
