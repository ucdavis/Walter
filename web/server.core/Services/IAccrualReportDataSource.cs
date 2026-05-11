using server.core.Models;

namespace server.core.Services;

public interface IAccrualReportDataSource
{
    /// <summary>
    /// Returns vacation accrual balance rows used by the accrual overview and monthly notification generator.
    /// </summary>
    Task<IReadOnlyList<EmployeeAccrualBalanceRecord>> GetEmployeeAccrualBalancesAsync(
        DateTime startDate,
        string? applicationUser = null,
        string? emulatingUser = null,
        CancellationToken ct = default);
}
