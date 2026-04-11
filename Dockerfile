FROM node:20-alpine

RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app

WORKDIR /usr/src/node-app

COPY package.json yarn.lock ./

USER node

RUN yarn install --pure-lockfile

COPY --chown=node:node . .

# Install Supercronic as root before switching to node user
USER root
RUN apk add --no-cache curl && \
    curl -fsSLO https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 && \
    chmod +x supercronic-linux-amd64 && \
    mv supercronic-linux-amd64 /usr/local/bin/supercronic

# Copy crontab (run as root so it can access the file)
COPY crontab /app/crontab

# Switch back to node user
USER node

EXPOSE 3000

# PaaS / Docker: run Node directly (PM2 is optional on a single managed process)
CMD ["node", "src/index.js"]
