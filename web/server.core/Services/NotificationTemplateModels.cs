using server.core.Models;

namespace server.core.Services;

public abstract class NotificationTemplateModelBase
{
    public static string DefaultLogoUrl => "/apple-touch-icon.png";

    public string AppName { get; init; } = "Walter";
    public string ButtonText { get; init; } = string.Empty;
    public string ButtonUrl { get; init; } = string.Empty;
    public string? LogoUrl { get; init; } = DefaultLogoUrl;
    public string? LayoutWidth { get; init; }
}

public sealed class NotificationButtonModel
{
    public NotificationButtonModel(string text, string url)
    {
        Text = text;
        Url = url;
    }

    public string Text { get; }
    public string Url { get; }
}

public enum AccrualEmployeeNotificationVariant
{
    FacultyAcademic,
    Staff,
    Generic,
}

public sealed class AccrualEmployeeNotificationTemplateModel : NotificationTemplateModelBase
{
    public required AccrualEmployeeNotificationPayload Payload { get; init; }
    public string GreetingName { get; init; } = string.Empty;
    public AccrualEmployeeNotificationVariant Variant { get; init; }
}

public sealed class AccrualViewerReportTemplateModel : NotificationTemplateModelBase
{
    public required AccrualViewerReportPayload Payload { get; init; }
}

public static class AccrualEmailTemplateFormatting
{
    public static string Date(DateTime value)
    {
        return value.ToString("MMMM d, yyyy", System.Globalization.CultureInfo.InvariantCulture);
    }

    public static string Hours(decimal value)
    {
        return $"{value:N1} hours";
    }

    public static string Percent(decimal value)
    {
        return $"{value:0.#}%";
    }

    public static string Currency(decimal value)
    {
        return value.ToString("C0", System.Globalization.CultureInfo.GetCultureInfo("en-US"));
    }

    public static string Status(string status)
    {
        return status switch
        {
            nameof(AccrualNotificationStatus.AtCap) => "At cap",
            nameof(AccrualNotificationStatus.ApproachingCap) => "Approaching cap",
            _ => status,
        };
    }
}
