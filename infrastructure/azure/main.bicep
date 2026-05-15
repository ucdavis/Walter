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

@description('Runtime stack for Linux Azure Functions')
param functionLinuxFxVersion string = 'DOTNET-ISOLATED|8.0'

@description('Whether the notification Function App should keep workers always warm.')
param functionAlwaysOn bool = true

@minValue(0)
@description('Minimum number of elastic workers assigned to the notification Function App.')
param functionMinimumElasticInstanceCount int = 1

@allowed([
  'Enabled'
  'Disabled'
])
@description('Whether the notification Function App accepts public network traffic. Disable only when deployments can reach the private SCM endpoint.')
param functionPublicNetworkAccess string = 'Enabled'

@description('Whether built-in App Service Authentication is enabled for the notification Function App.')
param functionSiteAuthEnabled bool = false

@description('Optional subnet resource ID for notification Function App VNet integration.')
param functionVirtualNetworkSubnetId string = ''

@description('Whether all notification Function App outbound traffic should route through VNet integration when functionVirtualNetworkSubnetId is supplied.')
param functionVnetRouteAllEnabled bool = false

@description('Whether to create a SQL firewall rule to allow access from Azure services (0.0.0.0).')
param allowAzureServicesToSql bool = false

var normalizedAppName = toLower(replace(replace(appName, ' ', '-'), '_', '-'))
var normalizedEnv = toLower(replace(replace(env, ' ', '-'), '_', '-'))

var baseName = empty(normalizedEnv)
  ? normalizedAppName
  : '${normalizedAppName}-${normalizedEnv}'

var nameToken = toLower(substring(uniqueString(resourceGroup().id, normalizedAppName, normalizedEnv), 0, 6))

var webAppName = 'web-${baseName}-${nameToken}'
var functionAppName = 'func-${baseName}-${nameToken}'
var functionStorageAccountName = 'st${nameToken}${substring(uniqueString(resourceGroup().id, normalizedAppName, normalizedEnv, 'functions'), 0, 8)}'
var sqlServerName = 'sql-${baseName}-${nameToken}'
var sqlDbName = normalizedAppName

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
  }
  dependsOn: [
    sql
  ]
}

module notificationsFunction './modules/functionapp.bicep' = {
  name: 'notificationsFunction'
  params: {
    location: location
    functionAppName: functionAppName
    storageAccountName: functionStorageAccountName
    appServicePlanId: appServicePlanId
    linuxFxVersion: functionLinuxFxVersion
    alwaysOn: functionAlwaysOn
    minimumElasticInstanceCount: functionMinimumElasticInstanceCount
    publicNetworkAccess: functionPublicNetworkAccess
    siteAuthEnabled: functionSiteAuthEnabled
    virtualNetworkSubnetId: functionVirtualNetworkSubnetId
    vnetRouteAllEnabled: functionVnetRouteAllEnabled
  }
  dependsOn: [
    sql
  ]
}

output webAppId string = web.outputs.webAppId
output functionAppId string = notificationsFunction.outputs.functionAppId
output sqlServerFqdn string = sql.outputs.sqlServerFqdn
output nameToken string = nameToken
output webAppName string = webAppName
output functionAppName string = notificationsFunction.outputs.functionAppName
output functionStorageAccountName string = notificationsFunction.outputs.storageAccountName
output sqlServerName string = sqlServerName
output sqlDbName string = sqlDbName
