FROM node:20-bullseye

# Install build tools (fallback for anything that needs compiling)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Tell node-gyp where Python is
ENV PYTHON=/usr/bin/python3

WORKDIR /app

# Copy package files
COPY package*.json ./

# Force better-sqlite3 to use a prebuilt binary instead of compiling
# This avoids the segfault we saw with the compiled version
ENV npm_config_build_from_source=false
ENV npm_config_foreground_scripts=true

RUN npm install --production=false

# Copy the rest of the source
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]