-- Flattened Natural Account segment hierarchy for the college/department financial summary report. One
-- row per leaf natural-account value (Code), carrying the segment's six ancestor rollup levels
-- denormalized as code+name pairs (ParentLevel0 = topmost rollup ... ParentLevel5 = nearest parent above
-- the leaf). Sourced from Aggie Enterprise ae_dwh.erp_account; the parent *names* are resolved by
-- self-joining erp_account on code = parent_level_N_code (the source exposes parent codes only). Note
-- erp_account.parent_level_0_code is the same top rollup the GL income/expense split keys on ('4%'/'5%').
-- Joined by usp_GetGlSegmentSummary and usp_GetGlSegmentSummaryFilterOptions to
-- GlSegmentMonthlyActuals.NaturalAccount for hierarchy-aware filter/group-by. Populated out-of-band for
-- now; an ADF pipeline will maintain it later.
create table dbo.ErpAccountHierarchy
(
    Code             varchar(20)    not null,  -- leaf natural-account value; join key to GlSegmentMonthlyActuals.NaturalAccount
    Description      nvarchar(1000) null,      -- leaf account description (erp_account.description)
    ParentLevel0Code varchar(20)    null,      -- topmost rollup (the '4%'/'5%' income/expense rollup)
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
    LoadedAt         datetime2(3)   not null constraint DF_ErpAccountHierarchy_LoadedAt default (sysutcdatetime()),
    constraint PK_ErpAccountHierarchy primary key clustered (Code)
)
go
