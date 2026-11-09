using Microsoft.AspNetCore.Mvc.Controllers;
using Server.Controllers;

namespace Server.Demo;

/// <summary>Restricts presentation requests before controllers can access ordinary reporting data or mutate state.</summary>
public sealed class DemoMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext http, DemoRequestContext demo)
    {
        if (!http.Request.Path.StartsWithSegments("/api"))
        {
            await next(http);
            return;
        }

        http.Response.Headers[DemoRequestContext.ContextHeader] = demo.ResponseContext;
        http.Response.Headers.CacheControl = "no-store";
        var action = http.GetEndpoint()?.Metadata.GetMetadata<ControllerActionDescriptor>();
        var isDemoController = action?.ControllerTypeInfo.AsType() == typeof(DemoController);
        var isRecovery = isDemoController &&
            (action!.MethodInfo.Name == nameof(DemoController.Status) || action.MethodInfo.Name == nameof(DemoController.Stop));

        // A stale, disabled, or foreign presentation cookie must not turn into an ordinary reporting request.
        if (demo.HasSession && !demo.IsActive && !isRecovery)
        {
            http.Response.StatusCode = StatusCodes.Status409Conflict;
            await http.Response.WriteAsJsonAsync(new { code = "presentation_session_invalid" });
            return;
        }

        var isBootstrap = action?.ControllerTypeInfo.AsType() == typeof(UserController) &&
            action.MethodInfo.Name == nameof(UserController.Me);
        var expected = http.Request.Headers[DemoRequestContext.ContextHeader].ToString();
        if (!isDemoController && !isBootstrap && expected.Length > 0 && expected != demo.ResponseContext)
        {
            http.Response.StatusCode = StatusCodes.Status409Conflict;
            await http.Response.WriteAsJsonAsync(new { code = "presentation_context_changed" });
            return;
        }

        if (demo.IsActive && !isDemoController && !IsSupportedRead(http.Request, action))
        {
            http.Response.StatusCode = StatusCodes.Status403Forbidden;
            await http.Response.WriteAsJsonAsync(new { message = "This feature is unavailable during a presentation." });
            return;
        }

        await next(http);
    }

    /// <summary>New endpoints are excluded until their entire data path has synthetic coverage.</summary>
    private static bool IsSupportedRead(HttpRequest request, ControllerActionDescriptor? action)
    {
        if (!HttpMethods.IsGet(request.Method) || action is null) return false;
        var controller = action.ControllerTypeInfo.AsType();
        // MVC trims Async from ActionName; match the actual method so supported reads remain available.
        var method = action.MethodInfo.Name;
        return controller == typeof(UserController) && method == nameof(UserController.Me)
            || controller == typeof(SystemController) && method is nameof(SystemController.GetFeatures) or nameof(SystemController.GetRumConfig)
            || controller == typeof(NotificationController) && method == nameof(NotificationController.Get)
            || controller == typeof(ProjectController) && method is
                nameof(ProjectController.GetByIamIdAsync) or nameof(ProjectController.GetByProjectNumberAsync) or
                nameof(ProjectController.GetPersonnelForProjects) or nameof(ProjectController.GetTransactionsForProjectsAsync) or
                nameof(ProjectController.GetGLPPMReconciliationAsync) or nameof(ProjectController.GetProjectionAsync) or
                nameof(ProjectController.GetProjectCostsAsync) or nameof(ProjectController.GetManagedFaculty)
            || controller == typeof(SearchController) && method is
                nameof(SearchController.GetCatalog) or nameof(SearchController.SearchPeople) or nameof(SearchController.SearchProjects) or
                nameof(SearchController.ResolveProjectPi) or nameof(SearchController.GetProjectsWhereCurrentUserIsTeamMember);
    }
}
