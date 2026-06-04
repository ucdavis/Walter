CREATE TABLE [dbo].[PpmProjectAwards]
(
    [ProjectNumber]   VARCHAR(15) NOT NULL,
    [PpmAwardNumber]  VARCHAR(15) NOT NULL,
    CONSTRAINT [PK_PpmProjectAwards]
        PRIMARY KEY CLUSTERED ([ProjectNumber], [PpmAwardNumber])
);
GO

CREATE NONCLUSTERED INDEX [IX_PpmProjectAwards_PpmAwardNumber]
    ON [dbo].[PpmProjectAwards] ([PpmAwardNumber])
    INCLUDE ([ProjectNumber]);
GO
