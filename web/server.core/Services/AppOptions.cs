namespace server.core.Services;

public sealed class AppOptions
{
    public const string SectionName = "App";

    public string Name { get; set; } = "Walter";
    public string? BaseUrl { get; set; }

    /// <summary>
    /// Returns a usable absolute HTTP(S) base URI; invalid optional configuration is treated as absent.
    /// </summary>
    public Uri? TryGetBaseUri()
    {
        if (string.IsNullOrWhiteSpace(BaseUrl) ||
            !Uri.TryCreate(BaseUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return null;
        }

        return uri;
    }
}
