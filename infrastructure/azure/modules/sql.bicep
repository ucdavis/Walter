@description('Location for all resources')
param location string

@description('SQL logical server name (must be globally unique)')
param sqlServerName string

@description('SQL admin login name')
param sqlAdminLogin string

@secure()
@description('SQL admin password')
param sqlAdminPassword string

@description('SQL database name')
param sqlDbName string

@description('Whether to create a SQL firewall rule to allow access from Azure services (0.0.0.0).')
param allowAzureServicesToSql bool = false

@description('SQL database SKU name')
param sqlDbSkuName string = 'Basic'

@description('SQL database SKU tier')
param sqlDbSkuTier string = 'Basic'

@description('SQL database SKU capacity')
param sqlDbSkuCapacity int = 5

@description('SQL database collation')
param sqlDbCollation string = 'SQL_Latin1_General_CP1_CI_AS'

@description('SQL database max size in bytes')
param sqlDbMaxSizeBytes int = 2147483648

resource sqlServer 'Microsoft.Sql/servers@2024-11-01-preview' = {
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

resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2024-11-01-preview' = if (allowAzureServicesToSql) {
  name: 'AllowAzureServices'
  parent: sqlServer
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource sqlDb 'Microsoft.Sql/servers/databases@2024-11-01-preview' = {
  name: sqlDbName
  parent: sqlServer
  location: location
  sku: {
    name: sqlDbSkuName
    tier: sqlDbSkuTier
    capacity: sqlDbSkuCapacity
  }
  properties: {
    collation: sqlDbCollation
    maxSizeBytes: sqlDbMaxSizeBytes
    zoneRedundant: false
    readScale: 'Disabled'
  }
}

output sqlServerId string = sqlServer.id
var sqlHostSuffix = environment().suffixes.sqlServerHostname
output sqlServerFqdn string = substring(sqlHostSuffix, 0, 1) == '.'
  ? '${sqlServer.name}${sqlHostSuffix}'
  : '${sqlServer.name}.${sqlHostSuffix}'
output sqlDbId string = sqlDb.id
