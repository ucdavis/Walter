# New SDK-style SQL project with Microsoft.Build.Sql

## Build

To build the project, run the following command:

```bash
dotnet build
```

🎉 Congrats! You have successfully built the project and now have a `dacpac` to deploy anywhere.

## Publish

To publish the project, the SqlPackage CLI or the SQL Database Projects extension for Azure Data Studio/VS Code is required. The following command will publish the project to a local SQL Server instance:

```bash
./SqlPackage /Action:Publish /SourceFile:bin/Debug/Walter.dacpac /TargetServerName:localhost /TargetDatabaseName:Walter
```

Learn more about authentication and other options for SqlPackage here: https://aka.ms/sqlpackage-ref

## Application Role and Permissions

The project defines a `WalterAppRole` database role that controls which stored procedures the web application can execute. The role and its permissions are managed in the `Security/` directory and deployed as part of the DACPAC.

### Adding permissions for new stored procedures

New stored procedures do **not** automatically get application access. When you add a new sproc, add a corresponding line to `Security/WalterAppRole.Permissions.sql`:

```sql
GRANT EXECUTE ON [dbo].[usp_YourNewProcedure] TO [WalterAppRole]
```

### Setting up a new environment

The role itself is deployed by the DACPAC, but mapping users to the role is a one-time step per environment. After creating a SQL login and database user for the application, run:

```sql
ALTER ROLE [WalterAppRole] ADD MEMBER [your_app_user];
```

### Install SqlPackage CLI

If you would like to use the command-line utility SqlPackage.exe for deploying the `dacpac`, you can obtain it as a dotnet tool.  The tool is available for Windows, macOS, and Linux.

```bash
dotnet tool install -g microsoft.sqlpackage
```
