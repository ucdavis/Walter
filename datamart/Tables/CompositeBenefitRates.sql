CREATE TABLE [dbo].[CompositeBenefitRates]
(
    [JobCode] VARCHAR(10) NOT NULL,
    [TitleCode] VARCHAR(10) NOT NULL,
    [Title] VARCHAR(100) NULL,
    [PersonalPGMCode] VARCHAR(10) NULL,
    [TitleUnitCode] VARCHAR(10) NULL,
    [CBRGroup] VARCHAR(200) NULL,
    [VacationAccrual] DECIMAL(5,4) NULL,
    [CBR] DECIMAL(5,4) NULL,
    CONSTRAINT [PK_CompositeBenefitRates] PRIMARY KEY ([JobCode], [TitleCode])
);