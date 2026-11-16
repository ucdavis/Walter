using server.core.Services;

namespace Server.Demo;

public static class DemoDataExtensions
{
    /// <summary>Registers the three datamart interfaces through one router over the real DatamartService.</summary>
    public static IServiceCollection AddDemoData(this IServiceCollection services)
    {
        services.AddSingleton(sp =>
        {
            var datamart = sp.GetRequiredService<DatamartService>();
            return new DemoDataRouter(datamart, datamart, datamart, new DemoDataSource());
        });
        services.AddSingleton<IDatamartService>(sp => sp.GetRequiredService<DemoDataRouter>());
        services.AddSingleton<IPpmPortfolioReader>(sp => sp.GetRequiredService<DemoDataRouter>());
        services.AddSingleton<IProjectionDataSource>(sp => sp.GetRequiredService<DemoDataRouter>());
        return services;
    }
}
