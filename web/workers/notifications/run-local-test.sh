#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage:
  web/workers/notifications/run-local-test.sh [options]

Runs the notifications Azure Functions worker locally in accrual-generation test mode:
- accrual generation enabled
- outbound sender disabled
- timer schedule shortened for local testing
- no email is sent

Configuration:
  The script reads DB_CONNECTION and DM_CONNECTION from the environment when set.
  If either is not set, the Functions host may still read it from local.settings.json.

Options:
      --schedule <ncrontab>      Accrual generation schedule. Default: "0 */1 * * * *" (every minute)
      --storage <connection>     AzureWebJobsStorage. Default: UseDevelopmentStorage=true
      --sender-enabled           Enable sender processing too. Dangerous until email client is configured.
      --no-build                 Skip dotnet build before starting the Functions host.
  -h, --help                     Show this help.

Examples:
  DB_CONNECTION='Server=localhost,...' \
  DM_CONNECTION='Server=datamart,...' \
  web/workers/notifications/run-local-test.sh

  web/workers/notifications/run-local-test.sh --schedule "*/30 * * * * *"

Notes:
  - When AzureWebJobsStorage is UseDevelopmentStorage=true, the script starts a Docker Azurite container if needed.
  - The sender remains disabled by default because the worker still uses DisabledOutboundEmailClient.
  - Generated messages are inserted into OutboundMessages in the app DB.
EOF
}

schedule="0 */1 * * * *"
storage="${AzureWebJobsStorage:-UseDevelopmentStorage=true}"
sender_enabled="false"
build_first="true"
azurite_container_name="walter-notifications-azurite"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --schedule)
      schedule="${2:-}"; shift 2 ;;
    --storage)
      storage="${2:-}"; shift 2 ;;
    --sender-enabled)
      sender_enabled="true"; shift ;;
    --no-build)
      build_first="false"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2 ;;
  esac
done

if [[ -z "$schedule" ]]; then
  echo "Schedule cannot be empty." >&2
  exit 2
fi

if ! command -v func >/dev/null 2>&1; then
  echo "Azure Functions Core Tools ('func') was not found." >&2
  echo "Install it first: https://learn.microsoft.com/azure/azure-functions/functions-run-local" >&2
  exit 1
fi

ensure_azurite() {
  if ! command -v nc >/dev/null 2>&1; then
    echo "netcat ('nc') is required to probe local Azurite ports 10000, 10001, and 10002." >&2
    exit 1
  fi

  azurite_ready() {
    nc -z localhost 10000 >/dev/null 2>&1 &&
      nc -z localhost 10001 >/dev/null 2>&1 &&
      nc -z localhost 10002 >/dev/null 2>&1
  }

  if azurite_ready; then
    return
  fi

  if nc -z localhost 10000 >/dev/null 2>&1; then
    cat >&2 <<'EOF'
AzureWebJobsStorage is UseDevelopmentStorage=true, but localhost:10000 is already in use
and a complete Azurite emulator is not listening on localhost:10000, 10001, and 10002.

Stop the process using port 10000, start Azurite manually, or pass --storage with explicit
BlobEndpoint/QueueEndpoint/TableEndpoint ports for a separate Azurite instance.
EOF
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    cat >&2 <<'EOF'
AzureWebJobsStorage is UseDevelopmentStorage=true, but Azurite is not listening on localhost:10000, 10001, and 10002 and Docker was not found.
Install/start Azurite manually:
  azurite
or install Docker and rerun this script.
EOF
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    cat >&2 <<'EOF'
AzureWebJobsStorage is UseDevelopmentStorage=true, but Azurite is not listening and Docker is not running.
Start Docker Desktop, then rerun this script.
EOF
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -Fxq "$azurite_container_name"; then
    echo "Azurite container '${azurite_container_name}' is already running, waiting for localhost:10000, 10001, and 10002..."
  elif docker ps -a --format '{{.Names}}' | grep -Fxq "$azurite_container_name"; then
    echo "Starting existing Azurite container '${azurite_container_name}'..."
    docker start "$azurite_container_name" >/dev/null
  else
    echo "Starting Azurite Docker container '${azurite_container_name}'..."
    docker run -d \
      --name "$azurite_container_name" \
      -p 10000:10000 \
      -p 10001:10001 \
      -p 10002:10002 \
      mcr.microsoft.com/azure-storage/azurite \
      >/dev/null
  fi

  for _ in {1..30}; do
    if azurite_ready; then
      echo "Azurite is ready on localhost:10000, 10001, and 10002."
      return
    fi
    sleep 1
  done

  echo "Azurite container started, but localhost:10000, 10001, and 10002 did not become ready in time." >&2
  exit 1
}

if [[ "$storage" == "UseDevelopmentStorage=true" ]]; then
  ensure_azurite
fi

if [[ -z "${DB_CONNECTION:-}" ]]; then
  echo "DB_CONNECTION is not set in the shell. The Functions host must find it in local.settings.json." >&2
fi

if [[ -z "${DM_CONNECTION:-}" ]]; then
  echo "DM_CONNECTION is not set in the shell. The Functions host must find it in local.settings.json." >&2
fi

if [[ "$sender_enabled" == "true" ]]; then
  cat >&2 <<'EOF'
Warning: --sender-enabled was requested. The worker currently uses DisabledOutboundEmailClient,
so sender processing is expected to fail until real email delivery is configured.

EOF
fi

export AzureWebJobsStorage="$storage"
export FUNCTIONS_WORKER_RUNTIME="dotnet-isolated"
export NOTIFICATIONS_ACCRUAL_GENERATION_SCHEDULE="$schedule"
export NOTIFICATIONS_SENDER_SCHEDULE="${NOTIFICATIONS_SENDER_SCHEDULE:-0 */15 * * * *}"
export Notifications__AccrualGenerationEnabled="true"
export Notifications__SenderEnabled="$sender_enabled"
export Datamart__ApplicationName="${Datamart__ApplicationName:-Walter-Notifications-LocalTest}"

if [[ "$build_first" == "true" ]]; then
  dotnet build "$SCRIPT_DIR/notifications.csproj"
fi

cat <<EOF
Starting notifications worker local test.

Accrual generation: enabled
Sender: ${sender_enabled}
Accrual schedule: ${schedule}
AzureWebJobsStorage: ${storage}
Datamart application name: ${Datamart__ApplicationName}

Watch logs for:
- SourceRecordCount
- EmployeeCandidateCount
- ViewerRecipientCount
- DraftCount
- EnqueuedCount
- DuplicateCount
- SkippedCount

Queued rows will be written to the app DB OutboundMessages table.
Press Ctrl+C to stop.

EOF

cd "$SCRIPT_DIR"
exec func start
