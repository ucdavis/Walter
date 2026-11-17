#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "$0")" && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/walter-projection-sql.XXXXXX")"
container="walter-projection-tests-$$-$RANDOM"
cleanup() {
    docker rm --force "$container" >/dev/null 2>&1 || true
    rm -rf "$scratch"
}
trap cleanup EXIT

password="$(openssl rand -hex 24)!Aa1"
printf 'ACCEPT_EULA=Y\nMSSQL_PID=Developer\nMSSQL_SA_PASSWORD=%s\n' "$password" > "$scratch/sql.env"
docker run --detach --rm --name "$container" --platform linux/amd64 --memory 2g \
    --publish 127.0.0.1::1433 --env-file "$scratch/sql.env" \
    mcr.microsoft.com/mssql/server:2022-latest >/dev/null

ready=false
for ((attempt = 0; attempt < 120; attempt++)); do
    if docker exec "$container" sh -c \
        'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -Q "SELECT 1" -b -o /dev/null' \
        >/dev/null 2>&1; then
        ready=true
        break
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)" != true ]]; then
        echo 'SQL Server test container exited before becoming ready.' >&2
        exit 1
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo 'SQL Server test container did not become ready within 120 seconds.' >&2
    exit 1
fi

binding="$(docker port "$container" 1433/tcp)"
port="${binding##*:}"
export WALTER_PROJECTION_SQL_CONNECTION="Server=127.0.0.1,$port;Database=master;User ID=sa;Password=$password;Encrypt=True;TrustServerCertificate=True"
echo 'Running projection contract tests against an isolated SQL Server 2022 instance.'
dotnet test "$script_dir/server.tests.csproj" \
    --filter 'FullyQualifiedName~server.tests.Integration.ProjectionSqlServerTests' \
    --logger 'trx;LogFileName=projection-sql.trx' --results-directory "$scratch/results" "$@"

# An opt-in suite must not report success when its tests were skipped or not discovered.
python3 - "$scratch/results/projection-sql.trx" <<'PY'
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
counters = root.find('.//{*}Counters').attrib
total = int(counters['total'])
executed = int(counters['executed'])
passed = int(counters['passed'])
if total == 0 or executed != total or passed != total:
    raise SystemExit(f'SQL verification incomplete: total={total}, executed={executed}, passed={passed}')
print(f'SQL verification complete: all {total} tests executed and passed.')
PY
