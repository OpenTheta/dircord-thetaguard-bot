# Use Node.js 22 LTS Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create db directory if it doesn't exist (will be mounted as volume)
RUN mkdir -p /app/db

# Expose port (default 5001, configurable via PORT env var)
EXPOSE 5001

# Use node instead of nodemon for production
CMD ["node", "index.js"]

