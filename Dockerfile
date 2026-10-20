FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4477
WORKDIR /app

COPY --chown=node:node package*.json ./
RUN chown node:node /app
USER node
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/next.config.mjs ./next.config.mjs

EXPOSE 4477

CMD ["npm", "start"]
