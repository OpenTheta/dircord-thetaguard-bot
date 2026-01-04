# Use Node.js 18 LTS Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create db directory if it doesn't exist (will be mounted as volume)
RUN mkdir -p /app/db

# Expose port (default 5001, configurable via PORT env var)
EXPOSE 5001

# Use node instead of nodemon for production
CMD ["node", "index.js"]

