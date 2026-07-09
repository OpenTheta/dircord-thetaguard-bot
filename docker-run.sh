#!/bin/bash
set -euo pipefail

# Back up the production database before deploying a new container.
# Restore procedure: see Readme.md ("Database backup & restore").
if [ -f db/ThetaGuard.db ]; then
  mkdir -p db/backups
  BACKUP="db/backups/ThetaGuard-$(date +%Y%m%d-%H%M%S).db"
  cp db/ThetaGuard.db "$BACKUP"
  echo "Database backed up to $BACKUP"
  # Keep the 20 most recent backups
  ls -1t db/backups/ThetaGuard-*.db 2>/dev/null | tail -n +21 | xargs -r rm --
fi

# Build the Docker image
docker build -t thetaguard-bot .

# Run the container with volume mounts for db and .env file
docker run -d \
  --name thetaguard-bot \
  --restart unless-stopped \
  --env-file .env \
  -v "$(pwd)/db:/app/db" \
  -p 5001:5001 \
  thetaguard-bot

echo "Bot container started. Use 'docker logs thetaguard-bot' to view logs."

