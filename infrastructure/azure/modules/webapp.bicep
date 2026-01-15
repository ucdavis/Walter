@description('Location for all resources')
param location string

@description('Web app name')
param webAppName string

@description('Existing App Service Plan resource ID')
param appServicePlanId string

@description('Runtime stack for Linux App Service')
param linuxFxVersion string

@description('App settings to apply to the web app (merged with existing by default)')
param appSettings object = {}

@description('Preserve existing app settings by merging with current settings')
param preserveExistingAppSettings bool = true

resource webApp 'Microsoft.Web/sites@2024-11-01' = {
  name: webAppName
  location: location
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

resource webAppSettings 'Microsoft.Web/sites/config@2024-11-01' = {
  name: 'appsettings'
  parent: webApp
  properties: preserveExistingAppSettings
    ? union(list('${webApp.id}/config/appsettings', '2024-11-01').properties, appSettings)
    : appSettings
}

output webAppId string = webApp.id
