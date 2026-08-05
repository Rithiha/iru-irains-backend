#!/usr/bin/env bash
#
# Per-boot startup for the iru-irains-backend Cloud Agent.
#
# Cloud Agent pods do not run systemd, so the PostgreSQL cluster that was
# provisioned during install must be started explicitly on every boot. This
# script is idempotent: it does nothing if the cluster is already online, and
# it returns once the server is ready to accept connections.
set -euo pipefail

PG_VERSION="16"

if sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
    echo "PostgreSQL cluster already online."
else
    echo "Starting PostgreSQL cluster..."
    sudo pg_ctlcluster "$PG_VERSION" main start
fi

# Block until the server is accepting connections.
for _ in $(seq 1 30); do
    if sudo -u postgres pg_isready -q; then
        echo "PostgreSQL is ready."
        exit 0
    fi
    sleep 1
done

echo "PostgreSQL did not become ready in time." >&2
exit 1
