using Mjml.Net;
using Microsoft.Extensions.Logging;
using Razor.Templating.Core;

namespace server.core.Services;

public interface INotificationRenderer
{
    /// <summary>
    /// Renders a Razor MJML template into final HTML suitable for email delivery.
    /// </summary>
    Task<string> RenderMjmlAsync<TModel>(
        string templatePath,
        TModel model,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Renders a Razor template without MJML compilation, used for subjects and plain text bodies.
    /// </summary>
    Task<string> RenderRazorAsync<TModel>(
        string templatePath,
        TModel model,
        CancellationToken cancellationToken = default);
}

public sealed class RazorMjmlNotificationRenderer : INotificationRenderer
{
    private readonly IRazorTemplateEngine _razorTemplateEngine;
    private readonly MjmlRenderer _mjmlRenderer;
    private readonly ILogger<RazorMjmlNotificationRenderer> _logger;

    public RazorMjmlNotificationRenderer(
        IRazorTemplateEngine razorTemplateEngine,
        MjmlRenderer mjmlRenderer,
        ILogger<RazorMjmlNotificationRenderer> logger)
    {
        _razorTemplateEngine = razorTemplateEngine;
        _mjmlRenderer = mjmlRenderer;
        _logger = logger;
    }

    /// <summary>
    /// Renders Razor first, then compiles the resulting MJML markup to email-compatible HTML.
    /// </summary>
    public async Task<string> RenderMjmlAsync<TModel>(
        string templatePath,
        TModel model,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(templatePath);

        var mjmlMarkup = await RenderRazorAsync(templatePath, model, cancellationToken);

        var (html, errors) = _mjmlRenderer.Render(mjmlMarkup, new MjmlOptions
        {
            Beautify = false,
        });

        if (errors.Count > 0)
        {
            var errorMessage = string.Join(Environment.NewLine, errors.Select(error => error.ToString()));
            _logger.LogError(
                "MJML rendering failed for template {TemplatePath}: {Errors}",
                templatePath,
                errorMessage);
            throw new InvalidOperationException(
                $"Failed to render MJML email template '{templatePath}': {errorMessage}");
        }

        return html;
    }

    /// <summary>
    /// Renders a Razor template directly for non-HTML email parts.
    /// </summary>
    public async Task<string> RenderRazorAsync<TModel>(
        string templatePath,
        TModel model,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(templatePath);

        cancellationToken.ThrowIfCancellationRequested();
        var rendered = await _razorTemplateEngine.RenderAsync(templatePath, model);
        cancellationToken.ThrowIfCancellationRequested();

        return rendered.Trim();
    }
}
