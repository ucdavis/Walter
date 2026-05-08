using server.core.Models;
using server.core.Services;

namespace Walter.Workers.Notifications;

public sealed class UnconfiguredAccrualReportDataSource : IAccrualReportDataSource
{
    public Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
        DateTime startDate,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default)
    {
        throw new InvalidOperationException(
            "The accrual Datamart report data source has not been configured for the notifications worker.");
    }
}
