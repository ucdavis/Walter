-- Run-scoped set of chart strings whose source aggregates diverge from
-- Walter's current TransactionalListing. usp_DiffTransactionalListing truncates
-- and repopulates this table each pipeline run, then usp_SwapTransactionalListing
-- reads it to know which chart strings to delete-and-replace. Passing the key
-- set through a table (rather than a quoted nvarchar(max) IN-list parameter)
-- avoids STRING_SPLIT round-trips and parser limits at high cardinality.
CREATE TABLE dbo.TransactionalListing_ChangedKeys
(
    ChartStringKey NVARCHAR(200) NOT NULL,
    CONSTRAINT PK_TransactionalListing_ChangedKeys
        PRIMARY KEY CLUSTERED (ChartStringKey)
);
GO
