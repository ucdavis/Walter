#!/bin/bash

# This script deploys the Bicep template for the TEST infrastructure
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/../main.bicep"

RESOURCE_GROUP="walter-test"
LOCATION="westus2"
WEBAPP_NAME="walter-test"
SQL_SERVER_NAME="walter-test"
SQL_DB_NAME="walter-test"
APP_SERVICE_PLAN_ID="/subscriptions/105dede4-4731-492e-8c28-5121226319b0/resourceGroups/Default-Web-WestUS/providers/Microsoft.Web/serverfarms/DefaultPlan2"
SQL_ADMIN_LOGIN="walter"
SQL_ADMIN_PASSWORD="123456A!"

# make sure you have the Azure CLI installed and logged in to the TEST subscription

# if you don't have the resource group, create it
az group create -n "${RESOURCE_GROUP}" -l "${LOCATION}"

# deploy the Bicep template with explicit TEST parameters
az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${TEMPLATE_FILE}" \
  --parameters \
    location="${LOCATION}" \
    webAppName="${WEBAPP_NAME}" \
    sqlServerName="${SQL_SERVER_NAME}" \
    sqlDbName="${SQL_DB_NAME}" \
    appServicePlanId="${APP_SERVICE_PLAN_ID}" \
    sqlAdminLogin="${SQL_ADMIN_LOGIN}" \
    sqlAdminPassword="${SQL_ADMIN_PASSWORD}"
