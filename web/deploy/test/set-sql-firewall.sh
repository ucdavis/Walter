RESOURCE_GROUP="walter-test"
APP_NAME="walter-test"
SQL_SERVER_NAME="walter-test"

# Get all outbound + additional outbound IPs
IPS=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --query '[outboundIpAddresses, possibleOutboundIpAddresses]' \
  -o tsv | tr ',' '\n' | sort -u)

COUNT=1
for IP in $IPS; do
  RULE="walter-test-${COUNT}"
  echo "Adding firewall rule for $IP → $RULE"
  az sql server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --server "$SQL_SERVER_NAME" \
    --name "$RULE" \
    --start-ip-address "$IP" \
    --end-ip-address "$IP"
  COUNT=$((COUNT+1))
done
