FROM node:20-bullseye

# Install Python and build tools for node-gyp (needed by better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Tell node-gyp where Python is
ENV PYTHON=/usr/bin/python3

WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production=false

# Copy the rest of the backend source
COPY . .

# Railway provides its own PORT env var; fall back to 3000
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]