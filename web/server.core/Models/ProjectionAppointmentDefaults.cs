namespace server.core.Models;

/// <summary>Planning defaults for new hires and missing imported benefit rates; saved appointments keep their chosen inputs.</summary>
public sealed record ProjectionAppointmentDefaults(decimal Fte, decimal CbrRate, decimal ColaRate, int ColaMonth)
{
    public static ProjectionAppointmentDefaults Default { get; } = new(1m, 0.2m, 0.03m, 7);
}
