#!/bin/bash
set -euo pipefail

# Back up the production database before deploying a new container.
# Restore procedure: see Readme.md ("Database backup & restore").
if [ -f db/ThetaGuard.db ]; then
  mkdir -p db/backups
  BACKUP="db/backups/ThetaGuard-$(date +%Y%m%d-%H%M%S).db"
  cp db/ThetaGuard.db "$BACKUP"
  # The database runs in WAL mode: recent writes live in the -wal file until
  # checkpointed, so it must be backed up (and restored) together with the db.
  [ -f db/ThetaGuard.db-wal ] && cp db/ThetaGuard.db-wal "$BACKUP-wal"
  echo "Database backed up to $BACKUP"
  # Keep the 20 most recent backups
  # A non-matching glob leaves ls a bogus arg, so ls exits non-zero; without
  # `|| true` that trips pipefail+set -e and aborts the deploy after the backup.
  ls -1t db/backups/ThetaGuard-*.db 2>/dev/null | tail -n +21 | xargs -r rm -- || true
  ls -1t db/backups/ThetaGuard-*.db-wal 2>/dev/null | tail -n +21 | xargs -r rm -- || true
fi

# Build the Docker image
docker build -t thetaguard-bot .

# Replace any previous container of the same name
docker stop thetaguard-bot 2>/dev/null || true
docker rm thetaguard-bot 2>/dev/null || true

# Run the container with volume mounts for db and .env file
docker run -d \
  --name thetaguard-bot \
  --restart unless-stopped \
  --env-file .env \
  -v "$(pwd)/db:/app/db" \
  -p 5001:5001 \
  thetaguard-bot

echo "Bot container started. Use 'docker logs thetaguard-bot' to view logs."

