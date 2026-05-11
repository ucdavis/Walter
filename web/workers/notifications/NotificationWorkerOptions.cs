namespace Walter.Workers.Notifications;

public sealed class NotificationWorkerOptions
{
    public const string SectionName = "Notifications";

    public bool SenderEnabled { get; init; }
    public bool AccrualGenerationEnabled { get; init; }
}
