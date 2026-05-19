# Razor Email Rendering Tradeoff

Walter currently keeps Razor/MJML email rendering in `web/server.core`.

This was a pragmatic choice for the initial notifications worker because the queued message contracts, accrual payload models, and outbound sender abstractions already live in `server.core`. Keeping the renderer there made the first production renderer small: the worker references one shared project, resolves `IOutboundMessageRenderer`, and renders from the durable `OutboundMessage.PayloadJson` contract.

## Tradeoff

Adding Razor support to `server.core` makes that project heavier.

The project now uses `Microsoft.NET.Sdk.Razor`, references `Microsoft.AspNetCore.App`, and depends on `Razor.Templating.Core` and `Mjml.Net`. Any future app, worker, test project, or tool that references `server.core` inherits that dependency surface even if it only needs domain models, EF data access, queueing, or accrual calculations.

The likely costs are:

- Larger restore/build/runtime dependency graph.
- More generated build artifacts from Razor compilation.
- Some increase in worker package size and possibly cold-start work.
- Presentation concerns living in a project that otherwise mostly holds domain, data, and service contracts.
- Less flexibility if a future worker wants a small non-ASP.NET dependency set, aggressive trimming, NativeAOT, or a very minimal runtime.

This is not expected to break normal ASP.NET or Azure Functions isolated worker usage. It is mostly an architecture and operational-heft tradeoff.

## Why It Is Acceptable For Now

The notifications worker already needs `server.core` for:

- `OutboundMessage` and queue processing.
- Accrual notification payload contracts.
- `IOutboundMessageRenderer`.
- Accrual message generation and Datamart-backed services.

The current deployment path builds successfully with Razor support, and the renderer has focused tests for the supported accrual template keys.

## Future Extraction Option

If `server.core` needs to become lean again, move email rendering into a separate `server.notifications` project.

The preferred boundary is:

- `server.core` owns the durable notification contract: `OutboundMessage`, queueing, accrual payload DTOs, template keys, template versions, payload versions, and message-generation rules.
- `server.notifications` owns notification presentation and delivery composition: Razor/MJML templates, template view models, `RazorMjmlNotificationRenderer`, `AccrualOutboundMessageRenderer`, and eventually the real email client registration.
- `web/workers/notifications` owns the worker host and scheduling. It composes `server.core` with `server.notifications` through dependency injection.

This split keeps the code that writes `PayloadJson` close to the payload DTOs and versioning rules, while moving the code that interprets that contract into email copy, HTML, text bodies, and links out of the core library.

Recommended split:

- Keep `server.core` for domain models, EF context, queue contracts, payload models, generator logic, and interfaces such as `IOutboundMessageRenderer`.
- Move Razor/MJML templates, template view models, `RazorMjmlNotificationRenderer`, and `AccrualOutboundMessageRenderer` into `server.notifications`.
- Have `web/workers/notifications` reference both `server.core` and the rendering project.
- Keep `web/server` referencing only `server.core` unless the web app later needs notification preview or admin-send tooling.

High-level migration steps:

1. Create `server.notifications` as `Microsoft.NET.Sdk.Razor`.
2. Add `Microsoft.AspNetCore.App`, `Razor.Templating.Core`, and `Mjml.Net` there.
3. Move `web/server.core/Views/**` into the new project.
4. Move rendering-only classes out of `server.core`, keeping shared contracts in `server.core`.
5. Update worker DI to call an extension method from the rendering project, such as `services.AddAccrualEmailRendering(configuration)`.
6. Move renderer tests or add a new test project reference for the rendering project.
7. Switch `server.core` back to `Microsoft.NET.Sdk` and remove Razor/MJML package references.

That extraction should not require database changes or outbound queue schema changes as long as `OutboundMessage.PayloadJson`, `TemplateKey`, `TemplateVersion`, and `PayloadVersion` remain the render contract.
