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

## CI/CD Pipeline

The project uses Azure Pipelines with two stages:

1. **Build Stage**: Compiles the SQL project and publishes the DACPAC artifact
2. **GenerateScript Stage**: Downloads the DACPAC, generates a deployment script against the WalterDev database on CAES-ELZAR server, and displays the full diff for review

The pipeline uses VSBuild with x86 architecture and requires the 'WalterDev' variable group with the following variables:
- `targetServer` - SQL Server hostname or IP address
- `targetDatabase` - Target database name (e.g., WalterDev)
- `sqlUsername` - SQL authentication username
- `sqlPassword` - SQL authentication password (secret)