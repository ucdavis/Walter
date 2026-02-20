# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Walter** (Warehouse Analytics and Ledger Tools for Enterprise Reporting) is a Microsoft SQL Server database project using the new SDK-style SQL project format with Microsoft.Build.Sql. The project targets SQL Server 2022 and generates a DACPAC file for deployment.

## Build Commands

**Build the project:**
```bash
dotnet build
```

**Build for release (used in CI/CD):**
```bash
dotnet build -c Release
```

**Clean build artifacts:**
```bash
dotnet clean
```

The build process generates a DACPAC file in `bin/Debug/Walter.dacpac` (or `bin/Release/Walter.dacpac` for release builds) that can be deployed to any SQL Server instance.

## Deployment

**Install SqlPackage CLI (if not already installed):**
```bash
dotnet tool install -g microsoft.sqlpackage
```

**Deploy to local SQL Server:**
```bash
./SqlPackage /Action:Publish /SourceFile:bin/Debug/Walter.dacpac /TargetServerName:localhost /TargetDatabaseName:Walter
```

**Generate deployment script (diff against target database):**
```bash
SqlPackage /Action:Script /SourceFile:bin/Debug/Walter.dacpac /TargetConnectionString:"Server=localhost;Database=Walter;Integrated Security=true;" /OutputPath:deploy.sql
```

## Local Development Environment

A Docker Compose configuration is provided for local SQL Server development:

```bash
docker-compose up -d
```

This starts SQL Server 2022 on localhost:1433 with:
- SA password: `YourStrong@Passw0rd`
- Persistent volume for data

## Project Structure

- `Tables/` - Database table definitions (compiled into DACPAC)
- `Views/` - Database view definitions (compiled into DACPAC)
- `Synonyms/` - Database synonym definitions for cross-database references
- `Security/` - Database roles and permission grants (compiled into DACPAC)
- `Scripts/PostDeployment/` - Views with linked server dependencies (deployed after DACPAC)
- `Scripts/Script.PostDeployment.sql` - Main post-deployment orchestration script
- `walter.sqlproj` - Main project file with build configuration
- `obj/` - Build artifacts and NuGet cache
- `bin/` - Build output directory containing the generated DACPAC

## Key Configuration

The project is configured with:
- **Target Platform**: SQL Server 2022 (SQL160DatabaseSchemaProvider in project file)
- **Collation**: 1033, CI (Case Insensitive)
- **Suppressed Dependencies**: `SuppressMissingDependenciesErrors=True` - Required for OPENQUERY and linked server references
- **External References**: `Microsoft.SqlServer.Dacpacs.Master` for system database objects

### SqlCmd Variables

The project uses SqlCmd variables for environment-specific configuration:
- `WalterDev` - Development database name
- `WalterDevServer` - Development server name
- `OtherServer` - External server for linked server connections
- `WalterLinked` - Linked server database reference

These can be overridden during deployment using `/Variables:` parameter with SqlPackage.

## Database Architecture

The database serves as a data warehousing layer that consolidates data from external enterprise systems. The project is transitioning from linked server queries to an ETL-based approach.

### Current Architecture

1. **DACPAC Core Schema**: Tables, stored procedures, functions managed in the SQL project
2. **Post-Deployment Scripts**: Views with linked server dependencies are deployed via post-deployment scripts (not compiled into DACPAC)
3. **View-Based Data Access**: Views abstract data access, enabling transition from linked servers to ETL without changing consumers

### Post-Deployment Scripts

Views that depend on linked servers (e.g., `v_PS_PROJECT_V_Oracle` accessing UCPath data via `AIT_BISTG_PRD-CAESAPP_HCMODS_APPUSER`) are located in:
- `Scripts/PostDeployment/` - Individual view scripts
- `Scripts/Script.PostDeployment.sql` - Main post-deployment script that orchestrates execution

These scripts run **after** the DACPAC is deployed, avoiding build failures from linked server dependencies.

### Migration Path

**Current State**: Views use OPENQUERY to access external Oracle databases
**Target State**: ETL processes populate local tables, views query local data
**Benefit**: Entity Framework and other consumers remain unchanged during migration

## Application Role and Permissions

The project defines a `WalterAppRole` database role in `Security/` that controls which stored procedures the application can execute.

- `Security/WalterAppRole.sql` - Role definition
- `Security/WalterAppRole.Permissions.sql` - Individual GRANT EXECUTE statements per stored procedure

### Adding permissions for new stored procedures

When a new stored procedure is added to the project, it does **not** automatically get application access. You must add a corresponding GRANT line to `Security/WalterAppRole.Permissions.sql`:

```sql
GRANT EXECUTE ON [dbo].[usp_YourNewProcedure] TO [WalterAppRole]
```

### Adding users to the role

The role-to-user mapping is environment-specific and done once per environment outside of source control. After creating a SQL login and database user, add them to the role:

```sql
ALTER ROLE [WalterAppRole] ADD MEMBER [your_app_user];
```

## CI/CD Pipeline

The project uses Azure Pipelines with five stages:

1. **Build Stage**: Compiles the SQL project and publishes the DACPAC artifact
2. **DeployDev Stage**: Deploys to WalterDev database automatically
3. **DeployTest Stage**: Deploys to WalterTest database automatically
4. **ReviewProd Stage**: Generates deployment script for production review
5. **DeployProd Stage**: Deploys to WalterProd behind approval gate (requires WalterProd environment approval)

The pipeline uses VSBuild with x86 architecture and requires three variable groups:

**WalterDev variable group** (for dev deployment):
- `targetServer` - SQL Server hostname (e.g., CAES-ROBERTO)
- `targetDatabase` - Target database name (WalterDev)
- `sqlUsername` - SQL authentication username (walter_deploy_dev)
- `sqlPassword` - SQL authentication password (secret)

**WalterTest variable group** (for test deployment):
- `targetServer` - SQL Server hostname (e.g., CAES-ROBERTO)
- `targetDatabase` - Target database name (WalterTest)
- `sqlUsername` - SQL authentication username (walter_deploy_test)
- `sqlPassword` - SQL authentication password (secret)

**WalterProd variable group** (for production deployment):
- `targetServer` - SQL Server hostname (e.g., CAES-ROBERTO)
- `targetDatabase` - Target database name (WalterProd)
- `sqlUsername` - SQL authentication username (walter_deploy_prod)
- `sqlPassword` - SQL authentication password (secret)