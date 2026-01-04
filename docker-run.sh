#!/bin/bash

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

