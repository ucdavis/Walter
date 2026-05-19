using Mjml.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Razor.Templating.Core;
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
        services.Configure<AppOptions>(
            context.Configuration.GetSection(AppOptions.SectionName));
        services.Configure<OutboundMessageSenderOptions>(
            context.Configuration.GetSection(OutboundMessageSenderOptions.SectionName));

        var datamartConnectionString = context.Configuration["DM_CONNECTION"]
            ?? context.Configuration.GetConnectionString("Datamart");
        var senderEnabled = context.Configuration.GetValue<bool>("Notifications:SenderEnabled");
        var accrualGenerationEnabled = context.Configuration.GetValue<bool>("Notifications:AccrualGenerationEnabled");

        if (accrualGenerationEnabled && string.IsNullOrWhiteSpace(datamartConnectionString))
        {
            throw new InvalidOperationException(
                "DatamartOptions/DM_CONNECTION or ConnectionStrings:Datamart is required when Notifications__AccrualGenerationEnabled=true.");
        }

        services.Configure<DatamartOptions>(options =>
        {
            options.ConnectionString = datamartConnectionString ?? string.Empty;
            options.ApplicationName = context.Configuration["Datamart:ApplicationName"]
                ?? $"Walter-Notifications-{context.HostingEnvironment.EnvironmentName}";
        });

        services.AddDbContextPool<AppDbContext>(options =>
            options.UseSqlServer(connectionString, sql => sql.MigrationsAssembly("server.core")));

        services.AddScoped<IOutboundMessageQueue, OutboundMessageQueue>();
        services.AddScoped<IAccrualViewerRecipientProvider, AccrualViewerRecipientProvider>();
        services.AddScoped<AccrualNotificationMessageBuilder>();
        services.AddScoped<IAccrualNotificationGenerator, AccrualNotificationGenerator>();
        services.AddScoped<DatamartService>();
        services.AddScoped<IDatamartService>(provider => provider.GetRequiredService<DatamartService>());
        services.AddScoped<IAccrualReportDataSource>(provider => provider.GetRequiredService<DatamartService>());

        services.AddSingleton<MjmlRenderer>();
        services.AddRazorTemplating();
        services.AddScoped<INotificationRenderer, RazorMjmlNotificationRenderer>();
        services.AddScoped<IOutboundMessageRenderer, AccrualOutboundMessageRenderer>();
        services.Configure<SmtpOutboundEmailClientOptions>(
            context.Configuration.GetSection(SmtpOutboundEmailClientOptions.SectionName));
        var smtpOptions = new SmtpOutboundEmailClientOptions();
        context.Configuration.GetSection(SmtpOutboundEmailClientOptions.SectionName).Bind(smtpOptions);

        // Do not claim queue rows for delivery unless SMTP is fully configured.
        if (senderEnabled)
        {
            var smtpValidationErrors = smtpOptions.ValidateForSending();
            if (smtpValidationErrors.Count > 0)
            {
                throw new InvalidOperationException(
                    "Notifications__SenderEnabled=true requires complete SMTP configuration: " +
                    string.Join(" ", smtpValidationErrors));
            }

            services.AddScoped<IOutboundEmailClient, SmtpOutboundEmailClient>();
        }
        else
        {
            services.AddScoped<IOutboundEmailClient, DisabledOutboundEmailClient>();
        }

        services.AddScoped<IOutboundMessageSender, OutboundMessageSender>();
        services.AddSingleton(provider =>
            provider.GetRequiredService<IOptions<OutboundMessageSenderOptions>>().Value);
    })
    .Build();

await host.RunAsync();
