#!/usr/bin/env bash
#
# Idempotent environment bootstrap for the iru-irains-backend Cloud Agent.
#
# Responsibilities:
#   1. Ensure PostgreSQL server + client are installed.
#   2. Ensure the local cluster is running (needed to provision the DB below).
#   3. Create the application role and database (if missing).
#   4. Install Node dependencies.
#   5. Generate a local .env pointing at the local PostgreSQL (if missing).
#   6. Apply the development schema + seed data.
#
# It is safe to run this script repeatedly.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# --- Local database configuration (development only) -----------------------
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-iru_user}"
DB_PASS="${DB_PASS:-iru_password}"
DB_NAME="${DB:-iru_irains}"
APP_PORT="${PORT:-3000}"
PG_VERSION="16"

echo "==> [1/6] Ensuring PostgreSQL is installed"
if ! command -v psql >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

echo "==> [2/6] Ensuring PostgreSQL cluster is running"
if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
    sudo pg_ctlcluster "$PG_VERSION" main start || true
fi
# Wait for the server to accept connections.
for _ in $(seq 1 30); do
    if sudo -u postgres pg_isready -q; then break; fi
    sleep 1
done

echo "==> [3/6] Ensuring role '$DB_USER' and database '$DB_NAME' exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
    END IF;
END
\$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" \
    -c "GRANT ALL ON SCHEMA public TO ${DB_USER}; ALTER SCHEMA public OWNER TO ${DB_USER};"

echo "==> [4/6] Installing Node dependencies"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

echo "==> [5/6] Ensuring .env exists"
if [ ! -f .env ]; then
    cat > .env <<ENV
DB_HOST="${DB_HOST}"
DB_USER="${DB_USER}"
DB_PORT=${DB_PORT}
DB_PASS="${DB_PASS}"
DB="${DB_NAME}"
PORT=${APP_PORT}

# SMTP is optional for local development. The server logs a verification
# warning at startup when these are unset but continues to run normally.
EMAIL_USER=""
EMAIL_PASS=""
EMAIL_PORT=587
EMAIL_HOST=""
ENV
    echo "    Created .env"
else
    echo "    .env already present, leaving it untouched"
fi

echo "==> [6/6] Applying development schema + seed data"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 -f .cursor/db/schema.sql

echo "==> Install complete."
