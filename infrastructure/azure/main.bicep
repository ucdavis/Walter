@description('Location for all resources')
param location string = resourceGroup().location

@description('Web app name')
param webAppName string

@description('Existing App Service Plan resource ID')
param appServicePlanId string

@description('SQL logical server name (must be globally unique)')
param sqlServerName string

@description('SQL database name')
param sqlDbName string

@description('SQL admin login name')
param sqlAdminLogin string

@secure()
@description('SQL admin password')
param sqlAdminPassword string

@description('Runtime stack for Linux App Service')
param linuxFxVersion string = 'DOTNETCORE|8.0'

@description('Whether to create a SQL firewall rule to allow access from Azure services (0.0.0.0).')
param allowAzureServicesToSql bool = false

var dbConnection = 'Server=tcp:${sqlServerName}.${environment().suffixes.sqlServerHostname},1433;Initial Catalog=${sqlDbName};Persist Security Info=False;User ID=${sqlAdminLogin};Password=${sqlAdminPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

module sql './modules/sql.bicep' = {
  name: 'sql'
  params: {
    location: location
    sqlServerName: sqlServerName
    sqlAdminLogin: sqlAdminLogin
    sqlAdminPassword: sqlAdminPassword
    sqlDbName: sqlDbName
    allowAzureServicesToSql: allowAzureServicesToSql
  }
}

module web './modules/webapp.bicep' = {
  name: 'web'
  params: {
    location: location
    webAppName: webAppName
    appServicePlanId: appServicePlanId
    linuxFxVersion: linuxFxVersion
    appSettings: {
      DB_CONNECTION: dbConnection
    }
  }
  dependsOn: [
    sql
  ]
}

output webAppId string = web.outputs.webAppId
output sqlServerFqdn string = sql.outputs.sqlServerFqdn
