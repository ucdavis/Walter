namespace server.Services;

internal static class ProjectionTimestamps
{
    /// <summary>Keep timestamp tokens distinct even when the clock stalls or moves backward.</summary>
    internal static DateTime Advance(DateTime previous, DateTime utcNow) =>
        utcNow > previous ? utcNow : DateTime.SpecifyKind(previous.AddTicks(1), DateTimeKind.Utc);
}
