# Web App Template

A full-stack web application template featuring a .NET 8 backend with React/Vite frontend, using OIDC authentication with Microsoft Entra ID.

## Architecture

- **Backend**: .NET 8 Web API with ASP.NET Core
- **Frontend**: React 19 with Vite, TypeScript, and TanStack Router/Query/Table
- **Authentication**: OIDC with Microsoft Entra ID (Azure AD)
- **Styling**: Tailwind CSS
- **Development**: Hot reload for both frontend and backend

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/ucdavis/web-app-template/
   cd web-app-template
   ```

2. **Open In DevContainer**

   - Open the project folder in Visual Studio Code.
   - Click the prompt to open in container (or manually select from the command palette).

_Using the DevContainer is optional, but it will get you the right version of dotnet + node, plus install all dependencies and setup a local SQL instance for you_

3. **Start the application**

   ```bash
   npm start
   ```

   This command automatically installs dependencies (if needed) and starts both the .NET backend and Vite frontend with hot reload enabled.

   _Optional: If dependencies change, you can manually reinstall with `npm install && cd client && npm install && cd ..` but you shouldn't have to, the `npm start` should handle it._

4. **Access the application**

The application will auto launch in your browser (to http://localhost:5174).

If you want to access endpoints individually, you can do so at the following URLs:

- Frontend: http://localhost:5174
- Backend API: http://localhost:5166 (nothing to see, but /api/\* has the direct API endpoints)
- API Documentation (Swagger): http://localhost:5166/swagger/index.html
- Health check: http://localhost:5166/health

### Database configuration

The backend requires a SQL Server connection string. By default `appsettings.Development.json` has a connection string configured for the local SQL Server instance.

When you want to specify your own DB connection, provide it by setting the `DB_CONNECTION` environment variable (for example in a `.env` file) or by updating `ConnectionStrings:DefaultConnection` in `appsettings.*.json` (`.env` is recommended)

For connecting to actual data sources, you'll also need to set `DM_CONNECTION` which should point to the Elzar database for real data connections.

### Auth Configuration

We use OIDC with Microsoft Entra ID (Azure AD) for authentication. The auth flow doesn't use any secrets and the settings in `appsettings.*.json` are sufficient for local development.

When you are ready to get your own, go to [Microsoft Entra ID](https://entra.microsoft.com/) and create a new application registration. Set the redirect url to `http://localhost:5166/signin-oidc` and check the box for "ID tokens".

You might also want to set the publisher domain to ucdavis.edu and fill in the other general branding info.

### Health check

The health check endpoint (`/health`) is configured to return the status of the application and its dependencies. It includes a database health check to ensure the SQL Server connection is healthy. See [Health Checks](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-9.0#entity-framework-core-dbcontext-probe).

## Logging and Monitoring

Walter sends backend logs, traces, and metrics to Elastic with OpenTelemetry, and it can also send frontend browser performance data to Elastic APM with Real User Monitoring (RUM).

### Backend OpenTelemetry

The backend telemetry setup lives in `server/Helpers/TelemetryHelper.cs`.

- Logs are written to JSON console output and also exported over OTLP.
- Traces and metrics include ASP.NET Core requests, outgoing HTTP calls, and SQL client activity.
- The OTLP exporter is configured through the standard `OTEL_*` environment variables, for example:
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS`
  - `OTEL_EXPORTER_OTLP_PROTOCOL`
  - `OTEL_RESOURCE_ATTRIBUTES`

If your Elastic APM / OTLP endpoint is already ready, setting those environment variables is enough for the backend to start shipping telemetry.

### Frontend RUM

The frontend can send page-load, route-change, and browser request timing data to Elastic APM with the JavaScript RUM agent.

To find the RUM server URL in Elastic:

1. Open Kibana.
2. Go to `Integrations`.
3. Open `APM`.
4. Open the installed APM integration or policy and copy the APM server URL from that setup.

Use these environment variables for Walter:

```text
Rum__Enabled=true
Rum__ServerUrl=https://<your-apm-endpoint>
Rum__ServiceName=walter-web
Rum__Environment=development
Rum__TransactionSampleRate=1.0
```

Notes:

- `Rum__ServiceName` should stay `walter-web`. That is the frontend service name Walter reports to Elastic.
- Use `development` locally and `production` in deployed environments for `Rum__Environment`.
- Use `1.0` sampling locally while bringing it up, and a lower value such as `0.2` in production.
- If `Rum__Enabled=false`, the frontend agent does not initialize.

Once configured, start the app and open Walter in the browser. To verify it is working:

1. Open browser devtools and look for network requests to your Elastic APM host.
2. In Kibana, open `Applications` and look for service `walter-web`.
3. Open `User Experience` to inspect page performance such as page-load timing and Core Web Vitals.

## Development

### Backend Development

The backend is configured with hot reload via `dotnet watch`. Any changes to C# files will automatically restart the server.

### Frontend Development

The frontend uses Vite's hot module replacement (HMR). Changes to React components, TypeScript files, and CSS will be reflected immediately.

### Authentication Flow

1. Frontend routes requiring authentication redirect to the backend's login endpoint
2. Backend handles OIDC flow with Microsoft Entra ID
3. Upon successful authentication, a same-site cookie is set
4. Frontend API calls automatically include the authentication cookie
5. Backend validates the cookie for protected endpoints

### Local dev login

When running locally in **Development** on **loopback** (`127.0.0.1` / `::1`), `GET /login` shows a small chooser page:

- **Login as PI**: signs in as `esspang@ucdavis.edu` (must already exist in the local DB)
- **Login as PM**: signs in as `kkolson@ucdavis.edu` (must already exist in the local DB)
- **Login as self**: uses the normal Entra (OIDC) auth flow

Outside of local dev, `/login` behaves like the normal auth entrypoint (OIDC challenge).

## Testing

### Client tests

- Run `cd client && npm test` to execute the Vitest suite once.
- Use `npm run test:watch` inside `client/` for red/green feedback while you work.
- Tests run against a jsdom environment with Testing Library so you do not need the backend running.

### Server tests

- Run `dotnet test` from the repository root to execute the .NET test project included in `app.sln`.
- Alternatively, target the project directly with `dotnet test tests/server.tests/server.tests.csproj`.
- The tests use EF Core's in-memory provider (see `tests/server.tests/TestDbContextFactory.cs`) so no SQL Server instance is required.

## Updating Dependencies

### Client

- JavaScript/TypeScript packages: run `npm outdated` at the repository root and inside `client/` to see what can be updated. Use `npm update` in each location for compatible updates, or `npm install <package>@latest` when you need to jump to a new major version.
- After updating Node packages, reinstall if needed (`npm install`, `cd client && npm install`) and rerun key checks like `npm run lint`, `cd client && npm test`, and `dotnet test`.

### Server

.Net is a bit more complicated, but we're going to use the dotnet-outdated tool to help.

Run the following command from the repository root:

```
dotnet-outdated
```

and it'll show you a nice table of what can be updated. Be careful when updating major versions, especially with packages that are pinned to the .net version.

You can update individual packages or you can use the `--upgrade` flag to update all at once. Here's a nice way to do it and only update minor/patch versions:

```
dotnet-outdated --upgrade --version-lock Major
```

If you update `Microsoft.EntityFrameworkCore.Design` or another package that a tool depends on, you'll want to update that tool as well to match, ex: `dotnet tool update dotnet-ef --local --version 8.0.21`. That will update it for you but also set the value in our `dotnet-tools.json` so it's consistent for everyone.

And as always, after updating dependencies, make sure to run `dotnet build` and `dotnet test` to verify everything is working.

## Project Structure

├── client/ # React frontend
│ ├── src/
│ │ ├── routes/ # TanStack Router routes
│ │ ├── queries/ # TanStack Query hooks
│ │ ├── lib/ # API client and utilities
│ │ └── shared/ # Shared components
│ ├── package.json
│ └── vite.config.ts
├── server/ # .NET backend
│ ├── Controllers/ # API controllers
│ ├── Helpers/ # Utility classes
│ ├── Properties/ # Launch settings
│ ├── Program.cs # Application entry point
│ └── server.csproj
├── package.json # Root package.json with start script
└── app.sln # Visual Studio solution file

```

## Available Scripts

### Root Level

- `npm start` - Starts both backend and frontend with hot reload

### Client Directory

- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build
- `npm test` - Run tests

### Server Directory

- `dotnet run` - Start the .NET application
- `dotnet watch` - Start with hot reload
- `dotnet build` - Build the application
- `dotnet test` - Run tests
```

## Deployment

Deployments use Azure DevOps (https://dev.azure.com/ucdavis/Walter) with separate pipelines for backend and web.

### Deploy Prep

When setting up a new Azure environment, you'll need:

- Website (Azure App Service - Linux preferred)
- Database (Azure SQL Database)

You'll then need to allow the App Service to access the SQL Database by configuring the firewall rules to allow Azure services. I've included a script in `deploy/test/set-sql-firewall.sh` that can help with this.

Then you'll need to setup Env Settings, basically mirror the `.env` file. Remember to set the correct connection string for your database.
