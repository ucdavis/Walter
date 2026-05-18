@description('Location for all resources')
param location string

@description('Function app name')
param functionAppName string

@description('Storage account name used by the Function App runtime')
param storageAccountName string

@description('Existing App Service Plan resource ID')
param appServicePlanId string

@description('Runtime stack for Linux Azure Functions')
param linuxFxVersion string

@description('Whether the Function App should keep workers always warm')
param alwaysOn bool = true

@minValue(0)
@description('Minimum number of elastic workers assigned to the Function App')
param minimumElasticInstanceCount int = 1

@allowed([
  'Enabled'
  'Disabled'
])
@description('Whether the Function App accepts public network traffic. Disable only when deployments can reach the private SCM endpoint')
param publicNetworkAccess string = 'Enabled'

@description('Whether built-in App Service Authentication is enabled for the Function App')
param siteAuthEnabled bool = false

@description('Optional subnet resource ID for Function App VNet integration')
param virtualNetworkSubnetId string = ''

@description('Whether all Function App outbound traffic should route through VNet integration when virtualNetworkSubnetId is supplied')
param vnetRouteAllEnabled bool = false

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource functionApp 'Microsoft.Web/sites@2025-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: union({
    serverFarmId: appServicePlanId
    httpsOnly: true
    publicNetworkAccess: publicNetworkAccess
    reserved: true
    siteConfig: {
      alwaysOn: alwaysOn
      linuxFxVersion: linuxFxVersion
      minimumElasticInstanceCount: minimumElasticInstanceCount
      vnetRouteAllEnabled: vnetRouteAllEnabled
    }
  }, empty(virtualNetworkSubnetId) ? {} : {
    virtualNetworkSubnetId: virtualNetworkSubnetId
  })
}

resource functionAppAuth 'Microsoft.Web/sites/config@2025-03-01' = {
  name: 'authsettingsV2'
  parent: functionApp
  properties: {
    platform: {
      enabled: siteAuthEnabled
    }
  }
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output storageAccountName string = storageAccount.name
