CREATE TABLE [dbo].[DataSourceBaseline]
(
    [BaselineID] INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    [LinkedServerName] NVARCHAR(128) NOT NULL,
    [SourceType] NVARCHAR(20) NOT NULL,
    [SchemaName] NVARCHAR(128) NULL,
    [TableName] NVARCHAR(128) NOT NULL,
    [ColumnList] NVARCHAR(MAX) NOT NULL,
    [BaselineRowCount] BIGINT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT [UQ_DataSourceBaseline_SourceTable] UNIQUE ([LinkedServerName], [TableName]),
    CONSTRAINT [CK_DataSourceBaseline_ColumnList_JSON] CHECK (ISJSON(ColumnList) = 1)
);
