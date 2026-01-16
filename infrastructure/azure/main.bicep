@description('Location for all resources')
param location string = resourceGroup().location

@description('Application name (ex: walter)')
param appName string = 'walter'

@description('Environment name (ex: test, production)')
param env string = ''

@description('Existing App Service Plan resource ID')
param appServicePlanId string

@description('SQL admin login name')
param sqlAdminLogin string

@secure()
@description('SQL admin password')
param sqlAdminPassword string

@description('Runtime stack for Linux App Service')
param linuxFxVersion string = 'DOTNETCORE|8.0'

@description('Whether to create a SQL firewall rule to allow access from Azure services (0.0.0.0).')
param allowAzureServicesToSql bool = false

var normalizedAppName = toLower(replace(replace(appName, ' ', '-'), '_', '-'))
var normalizedEnv = toLower(replace(replace(env, ' ', '-'), '_', '-'))

var baseName = empty(normalizedEnv)
  ? normalizedAppName
  : '${normalizedAppName}-${normalizedEnv}'

var nameToken = toLower(substring(uniqueString(resourceGroup().id, normalizedAppName, normalizedEnv), 0, 6))

var webAppName = 'web-${baseName}-${nameToken}'
var sqlServerName = 'sql-${baseName}-${nameToken}'
var sqlDbName = normalizedAppName

var sqlHostSuffix = environment().suffixes.sqlServerHostname
var sqlHost = substring(sqlHostSuffix, 0, 1) == '.'
  ? '${sqlServerName}${sqlHostSuffix}'
  : '${sqlServerName}.${sqlHostSuffix}'

var dbConnection = 'Server=tcp:${sqlHost},1433;Initial Catalog=${sqlDbName};Persist Security Info=False;User ID=${sqlAdminLogin};Password=${sqlAdminPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'

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
output nameToken string = nameToken
output webAppName string = webAppName
output sqlServerName string = sqlServerName
output sqlDbName string = sqlDbName
