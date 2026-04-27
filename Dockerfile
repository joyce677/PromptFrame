FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/prompt-frame.sqlite

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["npm", "run", "start"]
