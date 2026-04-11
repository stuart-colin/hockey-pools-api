FROM node:20-alpine

RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app

WORKDIR /usr/src/node-app

COPY package.json yarn.lock ./

USER node

RUN yarn install --pure-lockfile

COPY --chown=node:node . .

# Install Supercronic for cron scheduling
RUN apk add --no-cache curl && \
    curl -fsSLO https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 && \
    chmod +x supercronic-linux-amd64 && \
    mv supercronic-linux-amd64 /usr/local/bin/supercronic

# Copy crontab
COPY --chown=node:node crontab /app/crontab

EXPOSE 3000

# PaaS / Docker: run Node directly (PM2 is optional on a single managed process)
CMD ["node", "src/index.js"]
