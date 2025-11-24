@description('Location for all resources')
param location string = resourceGroup().location

@description('Web app name')
param webAppName string = 'walter-test'

@description('SQL logical server name')
param sqlServerName string = 'walter-test'

@description('SQL database name')
param sqlDbName string = 'walter-test'

@description('Existing App Service Plan resource ID')
param appServicePlanId string = '/subscriptions/105dede4-4731-492e-8c28-5121226319b0/resourceGroups/Default-Web-WestUS/providers/Microsoft.Web/serverfarms/DefaultPlan2'

@description('SQL admin login name (must match existing for updates)')
param sqlAdminLogin string = 'walter'

@secure()
@description('SQL admin password (used when creating a new server; ignored for existing one)')
param sqlAdminPassword string

// SQL Server
resource sqlServer 'Microsoft.Sql/servers@2024-05-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    // Password used only on create; ARM ignores it on update if already set
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// SQL Database
resource sqlDb 'Microsoft.Sql/servers/databases@2024-05-01-preview' = {
  name: sqlDbName
  parent: sqlServer
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648
    zoneRedundant: false
    readScale: 'Disabled'
  }
}

// Web app (Linux, .NET 8)
resource webApp 'Microsoft.Web/sites@2024-11-01' = {
  name: webAppName
  location: location
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    reserved: true // Linux
    
    // Keep siteConfig *minimal* so you don't accidentally clobber settings.
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      minimumElasticInstanceCount: 1
    }
  }
}
