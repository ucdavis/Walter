#!/bin/bash

# This script deploys the Bicep template for the main infrastructure

# make sure you have the Azure CLI installed and logged in to the TEST subscription

# if you don't have the resource group, create it
az group create -n walter-test -l westus2

# deploy the Bicep template (can add parameters with --parameters if needed)
az deployment group create --resource-group walter-test --template-file main.bicep --parameters sqlAdminPassword=123456A!
