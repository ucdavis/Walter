-- Crosswalk from GL natural account to its expenditure category.
-- Used to bucket GL transactions (and the projections feature) into the fixed set of
-- expenditure categories (e.g. '01 - Salaries and Wages', '02 - Fringe Benefits', ...).
-- GL aggregation runs in Redshift via OPENQUERY by natural account; this local table maps
-- ACCOUNT -> ExpenditureCategory after the OPENQUERY, so it is not joined inside Redshift.
create table dbo.ExpenditureTypeByAccount
(
    NaturalAccount      nvarchar(6)   not null,
    ExpenditureCategory nvarchar(200) not null,
    constraint PK_ExpenditureTypeByAccount
        primary key (NaturalAccount)
)
go
