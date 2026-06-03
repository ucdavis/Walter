CREATE TABLE [dbo].[PpmProjectAwards]
(
    [project_number]    VARCHAR(15) NOT NULL,
    [ppm_award_number]  VARCHAR(15) NOT NULL,
    CONSTRAINT [PK_PpmProjectAwards]
        PRIMARY KEY CLUSTERED ([project_number], [ppm_award_number])
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmProjectAwards_ppm_award_number]
    ON [dbo].[PpmProjectAwards] ([ppm_award_number])
    INCLUDE ([project_number]);
GO
