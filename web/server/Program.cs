using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Mjml.Net;
using Razor.Templating.Core;
using server.core.Data;
using server.HealthChecks;
using server.Helpers;
using Server.Services;
using server.core.Services;
using server.Services;

var builder = WebApplication.CreateBuilder(args);

// setup configuration sources (last one wins)
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddEnvFile(".env", optional: true) // secrets stored here
    .AddEnvFile($".env.{builder.Environment.EnvironmentName}", optional: true) // env-specific secrets
    .AddEnvironmentVariables(); // OS env vars override everything

// setup logging and telemetry
TelemetryHelper.ConfigureLogging(builder.Logging);
TelemetryHelper.ConfigureOpenTelemetry(builder.Services, builder.Environment);

// handy for getting true client IP
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

// add db connection string (check secrets first, then config, then default)
var conn = builder.Configuration["DB_CONNECTION"]
            ?? builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(conn))
{
    const string message = "No database connection string configured. Set the DB_CONNECTION environment variable or " +
                           "configure ConnectionStrings:DefaultConnection. For local containers use " +
                           "Server=sql,1433;Database=AppDb;User ID=sa;Password=LocalDev123!;Encrypt=False;TrustServerCertificate=True;.";

    throw new InvalidOperationException(message);
}

// Add auth config (entra)
builder.Services.AddAuthenticationServices(builder.Configuration, conn);

// add authorization
builder.Services.AddAuthorizationPolicies();

// app settings sections
builder.Services.Configure<IamSettings>(builder.Configuration.GetSection("Iam"));
builder.Services.Configure<FinancialSettings>(builder.Configuration.GetSection("Financial"));
builder.Services.Configure<RumOptions>(builder.Configuration.GetSection("Rum"));
builder.Services.Configure<AppOptions>(builder.Configuration.GetSection(AppOptions.SectionName));
builder.Services.Configure<DatamartOptions>(options =>
{
    options.ConnectionString = builder.Configuration["DM_CONNECTION"]
        ?? builder.Configuration.GetConnectionString("Datamart")
        ?? string.Empty;
    options.ApplicationName = builder.Configuration["Datamart:ApplicationName"]
        ?? $"Walter-{builder.Environment.EnvironmentName}";
});
builder.Services.Configure<ProcurementAssistantOptions>(options =>
{
    options.ElasticsearchBaseUrl = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ElasticsearchBaseUrl"]
        ?? builder.Configuration["PROCUREMENT_ELASTICSEARCH_BASE_URL"]
        ?? builder.Configuration["ELASTICSEARCH_BASE_URL"]
        ?? string.Empty;
    options.ElasticsearchApiKey = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ElasticsearchApiKey"]
        ?? builder.Configuration["PROCUREMENT_ELASTICSEARCH_API_KEY"]
        ?? builder.Configuration["ELASTICSEARCH_API_KEY"]
        ?? string.Empty;
    options.ElasticsearchUsername = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ElasticsearchUsername"]
        ?? builder.Configuration["PoSearch:ElasticUsername"]
        ?? builder.Configuration["PoSearch__ElasticUsername"]
        ?? builder.Configuration["PROCUREMENT_ELASTICSEARCH_USERNAME"]
        ?? builder.Configuration["ELASTICSEARCH_USERNAME"]
        ?? string.Empty;
    options.ElasticsearchPassword = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ElasticsearchPassword"]
        ?? builder.Configuration["PoSearch:ElasticPassword"]
        ?? builder.Configuration["PoSearch__ElasticPassword"]
        ?? builder.Configuration["PROCUREMENT_ELASTICSEARCH_PASSWORD"]
        ?? builder.Configuration["ELASTICSEARCH_PASSWORD"]
        ?? string.Empty;
    options.SupplierIndexName = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:SupplierIndexName"]
        ?? builder.Configuration["PROCUREMENT_SUPPLIER_INDEX_NAME"]
        ?? options.SupplierIndexName;
    options.LineItemIndexName = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:LineItemIndexName"]
        ?? builder.Configuration["PROCUREMENT_LINE_ITEM_INDEX_NAME"]
        ?? options.LineItemIndexName;
    options.ItemGroupIndexName = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupIndexName"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_INDEX_NAME"]
        ?? options.ItemGroupIndexName;
    options.SupplierTermsAggregationField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:SupplierTermsAggregationField"]
        ?? builder.Configuration["PROCUREMENT_SUPPLIER_TERMS_AGGREGATION_FIELD"]
        ?? options.SupplierTermsAggregationField;
    options.CategoryTermsAggregationField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:CategoryTermsAggregationField"]
        ?? builder.Configuration["PROCUREMENT_CATEGORY_TERMS_AGGREGATION_FIELD"]
        ?? options.CategoryTermsAggregationField;
    options.DateField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:DateField"]
        ?? builder.Configuration["PROCUREMENT_DATE_FIELD"]
        ?? options.DateField;
    options.ItemGroupNameField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupNameField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_NAME_FIELD"]
        ?? options.ItemGroupNameField;
    options.ItemGroupNameNormField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupNameNormField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_NAME_NORM_FIELD"]
        ?? options.ItemGroupNameNormField;
    options.ItemGroupDescriptionField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupDescriptionField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_DESCRIPTION_FIELD"]
        ?? options.ItemGroupDescriptionField;
    options.ItemGroupDescriptionNormField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupDescriptionNormField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_DESCRIPTION_NORM_FIELD"]
        ?? options.ItemGroupDescriptionNormField;
    options.ItemGroupVectorTextField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupVectorTextField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_VECTOR_TEXT_FIELD"]
        ?? options.ItemGroupVectorTextField;
    options.ItemGroupEmbeddingField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupEmbeddingField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_EMBEDDING_FIELD"]
        ?? options.ItemGroupEmbeddingField;
    options.ItemGroupAmountField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupAmountField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_AMOUNT_FIELD"]
        ?? options.ItemGroupAmountField;
    options.ItemGroupLineCountField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:ItemGroupLineCountField"]
        ?? builder.Configuration["PROCUREMENT_ITEM_GROUP_LINE_COUNT_FIELD"]
        ?? options.ItemGroupLineCountField;
    options.LineItemEmbeddingField = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:LineItemEmbeddingField"]
        ?? builder.Configuration["PROCUREMENT_LINE_ITEM_EMBEDDING_FIELD"]
        ?? options.LineItemEmbeddingField;
    options.EnableHybridSearch = bool.TryParse(
        builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:EnableHybridSearch"]
            ?? builder.Configuration["PROCUREMENT_ENABLE_HYBRID_SEARCH"],
        out var enableHybridSearch)
        ? enableHybridSearch
        : options.EnableHybridSearch;
    options.OpenAiApiKey = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:OpenAiApiKey"]
        ?? builder.Configuration["OPENAI_API_KEY"]
        ?? builder.Configuration["OpenAI:ApiKey"]
        ?? string.Empty;
    options.OpenAiBaseUrl = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:OpenAiBaseUrl"]
        ?? builder.Configuration["OPENAI_BASE_URL"]
        ?? builder.Configuration["OpenAI:BaseUrl"]
        ?? "https://api.openai.com/v1";
    options.OpenAiChatModel = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:OpenAiChatModel"]
        ?? builder.Configuration["OPENAI_CHAT_MODEL"]
        ?? builder.Configuration["OpenAI:ChatModel"]
        ?? options.OpenAiChatModel;
    options.OpenAiEmbeddingModel = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:OpenAiEmbeddingModel"]
        ?? builder.Configuration["OPENAI_EMBEDDING_MODEL"]
        ?? "text-embedding-3-small";
    options.OpenAiReasoningEffort = builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:OpenAiReasoningEffort"]
        ?? builder.Configuration["OPENAI_REASONING_EFFORT"]
        ?? builder.Configuration["OpenAI:ReasoningEffort"]
        ?? options.OpenAiReasoningEffort;
    options.DefaultSearchSize = int.TryParse(
        builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:DefaultSearchSize"],
        out var defaultSearchSize)
        ? defaultSearchSize
        : options.DefaultSearchSize;
    options.DefaultAggregationSize = int.TryParse(
        builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:DefaultAggregationSize"],
        out var defaultAggregationSize)
        ? defaultAggregationSize
        : options.DefaultAggregationSize;
    options.MaxAgentSteps = int.TryParse(
        builder.Configuration[$"{ProcurementAssistantOptions.SectionName}:MaxAgentSteps"],
        out var maxAgentSteps)
        ? maxAgentSteps
        : options.MaxAgentSteps;

    var queryAliasGroups = builder.Configuration
        .GetSection($"{ProcurementAssistantOptions.SectionName}:QueryAliasGroups")
        .Get<string[][]>();
    if (queryAliasGroups is { Length: > 0 })
    {
        options.QueryAliasGroups = queryAliasGroups;
    }

    var queryAliasGroupsByKey = builder.Configuration
        .GetSection($"{ProcurementAssistantOptions.SectionName}:QueryAliasGroupsByKey")
        .Get<Dictionary<string, string[]>>();
    if (queryAliasGroupsByKey is { Count: > 0 })
    {
        options.QueryAliasGroupsByKey = new Dictionary<string, string[]>(
            queryAliasGroupsByKey,
            StringComparer.OrdinalIgnoreCase);
    }

    var supplierComparisonExpansionGroups = builder.Configuration
        .GetSection($"{ProcurementAssistantOptions.SectionName}:SupplierComparisonExpansionGroups")
        .Get<Dictionary<string, string[]>>();
    if (supplierComparisonExpansionGroups is { Count: > 0 })
    {
        options.SupplierComparisonExpansionGroups = supplierComparisonExpansionGroups;
    }
});

builder.Services.AddControllers();

// add response caching for pages that opt-in
// https://learn.microsoft.com/en-us/aspnet/core/performance/caching/middleware?view=aspnetcore-9.0
builder.Services.AddResponseCaching();

// add singleton services here
builder.Services.AddSingleton<IFinancialApiService, FinancialApiService>();
builder.Services.AddSingleton<IDatamartService, DatamartService>();
builder.Services.AddHttpClient<IProcurementSearchGateway, ElasticsearchProcurementSearchGateway>(client =>
{
    client.Timeout = TimeSpan.FromMinutes(2);
});
builder.Services.AddHttpClient<IProcurementEmbeddingService, OpenAiProcurementEmbeddingService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddHttpClient<IProcurementAgentModelClient, OpenAiProcurementAgentModelClient>(client =>
{
    client.Timeout = TimeSpan.FromMinutes(2);
});
builder.Services.AddScoped<IProcurementAliasCatalog, ProcurementAliasCatalog>();
builder.Services.AddScoped<IProcurementQueryParser, ProcurementQueryParser>();
builder.Services.AddScoped<IProcurementAssistantService>(serviceProvider =>
    new ProcurementAssistantService(
        serviceProvider.GetRequiredService<IProcurementSearchGateway>(),
        serviceProvider.GetRequiredService<IProcurementEmbeddingService>(),
        serviceProvider.GetRequiredService<IProcurementAgentModelClient>(),
        serviceProvider.GetRequiredService<IProcurementQueryParser>(),
        serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<ProcurementAssistantOptions>>(),
        serviceProvider.GetRequiredService<ILogger<ProcurementAssistantService>>()));

// add scoped services here
builder.Services.AddScoped<IDbInitializer, DbInitializer>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IEntraUserAttributeService, EntraUserAttributeService>();
builder.Services.AddScoped<IGraphService, GraphService>();
builder.Services.AddHttpClient<IIdentityService, IdentityService>();
builder.Services.AddScoped<IUserProfileOrchestrator, UserProfileOrchestrator>();
builder.Services.AddSingleton<MjmlRenderer>();
builder.Services.AddRazorTemplating();
builder.Services.AddScoped<INotificationRenderer, RazorMjmlNotificationRenderer>();
builder.Services.AddScoped<IOutboundMessageRenderer, AccrualOutboundMessageRenderer>();
// add auth policies here

builder.Services.AddDbContextPool<AppDbContext>(o => o.UseSqlServer(conn, opt => opt.MigrationsAssembly("server.core")));

builder.Services
    .AddHealthChecks()
    .AddDbContextCheck<AppDbContext>();

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// configure data protection (generated keys for auth and such)
var keysPath = Path.Combine(builder.Environment.ContentRootPath, "..", ".aspnet", "DataProtection-Keys");
Directory.CreateDirectory(keysPath);

builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keysPath));

var app = builder.Build();

// do db migrations at startup
using (var scope = app.Services.CreateScope())
{
    var init = scope.ServiceProvider.GetRequiredService<IDbInitializer>();
    var env = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
    await init.InitializeAsync(env.IsDevelopment());
}

app.UseForwardedHeaders();

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseResponseCaching();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    // swagger only in development
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    // only use HTTPS redirection in non-development environments
    app.UseHttpsRedirection();
}


app.UseAuthentication();
app.UseAuthorization();

// enrich every log with request context
app.UseRequestContextLogging();

// app.UseHttpLogging(); // if you want extra logging. It's a little overkill though with the current logging setup

app.MapControllers();

var healthEndpoint = app.MapHealthChecks("/health");

// Cache the health check response for 10 seconds to protect the database from rapid polling.
healthEndpoint.WithMetadata(new ResponseCacheAttribute
{
    Duration = 10,
    Location = ResponseCacheLocation.Any,
    NoStore = false,
});


app.MapFallbackToFile("/index.html");

app.Run();
