CREATE TABLE [dbo].[CompositeBenefitRates]
(
    [RateSet] VARCHAR(10) NOT NULL CONSTRAINT [DF_CompositeBenefitRates_RateSet] DEFAULT 'UCD', -- 'UCD' (campus rates) or 'ANR' (federally approved rates); each set loaded out-of-band from its own workbook
    [JobCode] VARCHAR(10) NOT NULL,
    [TitleCode] VARCHAR(10) NOT NULL,
    [Title] VARCHAR(100) NULL,
    [PersonalPGMCode] VARCHAR(10) NULL,   -- UCD rows only
    [TitleUnitCode] VARCHAR(10) NULL,     -- UCD rows only
    [CBRGroup] VARCHAR(200) NULL,
    [VacationAccrual] DECIMAL(5,4) NULL,  -- UCD rows only
    [CBR] DECIMAL(5,4) NULL,
    CONSTRAINT [PK_CompositeBenefitRates] PRIMARY KEY ([RateSet], [JobCode])
);