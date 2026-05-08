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

@description('App settings to apply to the function app')
param appSettings object = {}

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

var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource functionApp 'Microsoft.Web/sites@2025-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    reserved: true
    siteConfig: {
      alwaysOn: true
      linuxFxVersion: linuxFxVersion
      minimumElasticInstanceCount: 1
    }
  }
}

resource functionAppSettings 'Microsoft.Web/sites/config@2025-03-01' = {
  name: 'appsettings'
  parent: functionApp
  properties: union({
    AzureWebJobsStorage: storageConnection
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'dotnet-isolated'
  }, appSettings)
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output storageAccountName string = storageAccount.name
