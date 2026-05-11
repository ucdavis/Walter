using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using server.core.Data;

namespace Server.Tests;

public static class TestDbContextFactory
{
    /// <summary>
    /// Creates a fresh AppDbContext using EFCore InMemory with a unique database name,
    /// so each test starts clean.
    /// </summary>
    public static AppDbContext CreateInMemory()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"TestDb_{Guid.NewGuid():N}")
            .EnableSensitiveDataLogging()
            .Options;

        var ctx = new AppDbContext(options);
        ctx.Database.EnsureCreated();
        return ctx;
    }

    public static AppDbContext CreateSqlite(string connectionString, params IInterceptor[] interceptors)
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connectionString)
            .EnableSensitiveDataLogging();

        if (interceptors.Length > 0)
        {
            builder.AddInterceptors(interceptors);
        }

        var ctx = new AppDbContext(builder.Options);
        ctx.Database.OpenConnection();
        CreateOutboundMessagesSchema(ctx);
        return ctx;
    }

    private static void CreateOutboundMessagesSchema(AppDbContext ctx)
    {
        ctx.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS "OutboundMessages" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_OutboundMessages" PRIMARY KEY AUTOINCREMENT,
                "RunId" TEXT NOT NULL,
                "NotificationType" TEXT NOT NULL,
                "RecipientType" TEXT NOT NULL,
                "Channel" TEXT NOT NULL,
                "RecipientEmail" TEXT NOT NULL,
                "RecipientName" TEXT NULL,
                "Status" TEXT NOT NULL,
                "DedupeKey" TEXT NOT NULL,
                "TemplateKey" TEXT NOT NULL,
                "TemplateVersion" INTEGER NOT NULL,
                "PayloadVersion" INTEGER NOT NULL,
                "PayloadJson" TEXT NOT NULL,
                "NotBeforeUtc" TEXT NOT NULL,
                "LockedUntilUtc" TEXT NULL,
                "LockId" TEXT NULL,
                "AttemptCount" INTEGER NOT NULL,
                "LastError" TEXT NULL,
                "ProviderMessageId" TEXT NULL,
                "CreatedUtc" TEXT NOT NULL,
                "SentUtc" TEXT NULL
            );
            """);

        ctx.Database.ExecuteSqlRaw("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_OutboundMessages_DedupeKey"
            ON "OutboundMessages" ("DedupeKey");
            """);
    }
}
