@description('Location for all resources')
param location string

@description('Web app name')
param webAppName string

@description('Existing App Service Plan resource ID')
param appServicePlanId string

@description('Runtime stack for Linux App Service')
param linuxFxVersion string

@description('Enable the system-assigned identity when granting access to App Configuration.')
param enableSystemAssignedIdentity bool = false

resource webApp 'Microsoft.Web/sites@2025-03-01' = {
  name: webAppName
  location: location
  identity: enableSystemAssignedIdentity ? {
    type: 'SystemAssigned'
  } : null
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    reserved: true // Linux

    // Keep siteConfig minimal so you don't accidentally clobber settings.
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      minimumElasticInstanceCount: 1
    }
  }
}

output webAppId string = webApp.id
output principalId string = enableSystemAssignedIdentity ? webApp.identity!.principalId : ''
