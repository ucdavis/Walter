-- Composite benefit rates per UCPath business unit and job code, loaded
-- out-of-band from each business unit's workbook: DVCMP (campus), DVMED (UC
-- Davis Health) and UCANR (ANR). RateSet matches the 391's Business Unit Code,
-- which dbo.PositionBudgetsCognos carries as BusinessUnit. RateSet is last so
-- adding it is an ALTER TABLE ADD, not a table rebuild; existing rows migrate
-- as DVCMP through the default.
CREATE TABLE [dbo].[CompositeBenefitRates]
(
    [JobCode] VARCHAR(10) NOT NULL,
    [TitleCode] VARCHAR(10) NULL,
    [Title] VARCHAR(100) NULL,
    [PersonalPGMCode] VARCHAR(10) NULL,
    [TitleUnitCode] VARCHAR(10) NULL,
    [CBRGroup] VARCHAR(200) NULL,
    [VacationAccrual] DECIMAL(5,4) NULL,
    [CBR] DECIMAL(5,4) NULL,
    [RateSet] VARCHAR(10) NOT NULL CONSTRAINT [DF_CompositeBenefitRates_RateSet] DEFAULT 'DVCMP',
    CONSTRAINT [PK_CompositeBenefitRates] PRIMARY KEY ([RateSet], [JobCode])
);
