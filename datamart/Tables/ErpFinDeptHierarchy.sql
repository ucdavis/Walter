-- Flattened Financial Department segment hierarchy for the college/department financial summary
-- report. One row per leaf financial-department value (Code), carrying the segment's six ancestor
-- rollup levels denormalized as code+name pairs (ParentLevel0 = topmost rollup ... ParentLevel5 =
-- nearest parent above the leaf; AE encodes the level as the code's suffix letter A-G, leaf depth G).
-- Sourced from Aggie Enterprise ae_dwh.erp_fin_dept; the parent *names* are resolved by self-joining
-- erp_fin_dept on code = parent_level_N_code (the source exposes parent codes only). Joined by
-- usp_GetGlBalanceSummary and usp_GetGlBalanceSummaryFilterOptions to GlSummaryBalances.Dept for
-- hierarchy-aware filtering. Populated out-of-band for now; an ADF pipeline will maintain it later.
create table dbo.ErpFinDeptHierarchy
(
    Code             varchar(20)    not null,  -- leaf financial-department value; join key to GlSummaryBalances.Dept
    Description      nvarchar(1000) null,      -- leaf department description (erp_fin_dept.description)
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
    LoadedAt         datetime2(3)   not null constraint DF_ErpFinDeptHierarchy_LoadedAt default (sysutcdatetime()),
    constraint PK_ErpFinDeptHierarchy primary key clustered (Code)
)
go
