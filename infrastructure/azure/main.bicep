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

@secure()
@description('Datamart connection string used by web and notification worker Datamart integrations')
param datamartConnectionString string

@description('Runtime stack for Linux App Service')
param linuxFxVersion string = 'DOTNETCORE|8.0'

@description('Runtime stack for Linux Azure Functions')
param functionLinuxFxVersion string = 'DOTNET-ISOLATED|8.0'

@description('Timer schedule for outbound message sending. NCRONTAB format with seconds.')
param notificationSenderSchedule string = '0 */15 * * * *'

@description('Timer schedule for monthly accrual notification generation. NCRONTAB format with seconds.')
param accrualNotificationSchedule string = '0 0 9 1 * *'

@description('Whether to create a SQL firewall rule to allow access from Azure services (0.0.0.0).')
param allowAzureServicesToSql bool = false

@description('Whether Elastic RUM config should be published to the frontend.')
param rumEnabled bool = false

@description('Elastic APM RUM intake URL.')
param rumServerUrl string = ''

@description('Frontend service name reported to Elastic APM.')
param rumServiceName string = 'walter-web'

@description('Frontend service version reported to Elastic APM. Leave blank to fall back to the app assembly version.')
param rumServiceVersion string = ''

@description('Transaction sample rate for the browser agent. Use a string so App Settings preserve the exact value.')
param rumTransactionSampleRate string = '0.2'

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
      DM_CONNECTION: datamartConnectionString
      Datamart__ApplicationName: empty(normalizedEnv) ? 'Walter-Production' : 'Walter-${normalizedEnv}'
      Rum__Enabled: string(rumEnabled)
      Rum__Environment: empty(normalizedEnv) ? 'production' : normalizedEnv
      Rum__ServerUrl: rumServerUrl
      Rum__ServiceName: rumServiceName
      Rum__ServiceVersion: rumServiceVersion
      Rum__TransactionSampleRate: rumTransactionSampleRate
    }
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
    appSettings: {
      DB_CONNECTION: dbConnection
      DM_CONNECTION: datamartConnectionString
      Datamart__ApplicationName: empty(normalizedEnv) ? 'Walter-Notifications-Production' : 'Walter-Notifications-${normalizedEnv}'
      NOTIFICATIONS_SENDER_SCHEDULE: notificationSenderSchedule
      NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE: accrualNotificationSchedule
      Notifications__SenderEnabled: 'false'
      Notifications__AccrualGenerationEnabled: 'false'
    }
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
