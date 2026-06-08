using server.core.Models;

namespace server.core.Services;

public abstract class NotificationTemplateModelBase
{
    public static string DefaultAppHomeUrl => "https://walter.ucdavis.edu";
    public static string DefaultLogoUrl => "/apple-touch-icon.png";
    public static string DefaultUniversityHomeUrl => "https://ucdavis.edu";
    public static string DefaultUniversityLogoUrl => "/ucdavis.svg";

    public string AppName { get; init; } = "Walter";
    public string? AppHomeUrl { get; init; } = DefaultAppHomeUrl;
    public string ButtonText { get; init; } = string.Empty;
    public string ButtonUrl { get; init; } = string.Empty;
    public string AutomaticFooterText { get; init; } = "This email was automatically generated. Please do not reply to it.";
    public string? LogoUrl { get; init; } = DefaultLogoUrl;
    public string? LayoutWidth { get; init; }
    public string? UniversityHomeUrl { get; init; } = DefaultUniversityHomeUrl;
    public string? UniversityLogoUrl { get; init; } = DefaultUniversityLogoUrl;
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

    public static string HoursValue(decimal value)
    {
        return decimal.Remainder(value, 1m) == 0m
            ? value.ToString("N0", System.Globalization.CultureInfo.InvariantCulture)
            : value.ToString("N1", System.Globalization.CultureInfo.InvariantCulture);
    }

    public static string HoursUnit(decimal value)
    {
        return $"{HoursValue(value)} {(value == 1m ? "hour" : "hours")}";
    }

    public static string HoursAbbreviation(decimal value)
    {
        return $"{HoursValue(value)} hrs";
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
