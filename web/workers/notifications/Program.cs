using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using server.core.Data;
using server.core.Services;
using Walter.Workers.Notifications;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureAppConfiguration((context, config) =>
    {
        config
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            .AddJsonFile($"appsettings.{context.HostingEnvironment.EnvironmentName}.json", optional: true, reloadOnChange: false)
            .AddEnvironmentVariables();
    })
    .ConfigureServices((context, services) =>
    {
        var connectionString = context.Configuration["DB_CONNECTION"]
            ?? context.Configuration.GetConnectionString("DefaultConnection");

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("No database connection string configured. Set DB_CONNECTION.");
        }

        services.Configure<NotificationWorkerOptions>(
            context.Configuration.GetSection(NotificationWorkerOptions.SectionName));

        services.AddDbContextPool<AppDbContext>(options =>
            options.UseSqlServer(connectionString, sql => sql.MigrationsAssembly("server.core")));

        services.AddScoped<IOutboundMessageQueue, OutboundMessageQueue>();
        services.AddScoped<IAccrualViewerRecipientProvider, AccrualViewerRecipientProvider>();
        services.AddScoped<AccrualNotificationMessageBuilder>();
        services.AddScoped<IAccrualNotificationGenerator, AccrualNotificationGenerator>();
        services.AddScoped<IAccrualReportDataSource, UnconfiguredAccrualReportDataSource>();

        services.AddScoped<IOutboundMessageRenderer, PlaceholderOutboundMessageRenderer>();
        services.AddScoped<IOutboundEmailClient, DisabledOutboundEmailClient>();
        services.AddScoped<IOutboundMessageSender, OutboundMessageSender>();
        services.AddSingleton(new OutboundMessageSenderOptions());
    })
    .Build();

await host.RunAsync();
