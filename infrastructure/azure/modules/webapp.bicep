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

resource webAppSettings 'Microsoft.Web/sites/config@2024-11-01' = if (!empty(appSettings)) {
  name: 'appsettings'
  parent: webApp
  properties: appSettings
}

output webAppId string = webApp.id
