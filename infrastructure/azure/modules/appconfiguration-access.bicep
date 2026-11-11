@description('Existing App Configuration store in this module\'s resource group.')
param storeName string

@description('Web app system-assigned managed identity object ID.')
param principalId string

resource store 'Microsoft.AppConfiguration/configurationStores@2024-06-01' existing = {
  name: storeName
}

// Data Reader grants no writes and is scoped to this store, not the shared resource group.
resource dataReader 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '516239f1-63e1-4d78-a4de-a74fb236a071'
}

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(store.id, principalId, dataReader.id)
  scope: store
  properties: {
    roleDefinitionId: dataReader.id
    principalId: principalId
    // Explicit type avoids directory lookup races for a newly created managed identity.
    principalType: 'ServicePrincipal'
  }
}

output endpoint string = store.properties.endpoint
