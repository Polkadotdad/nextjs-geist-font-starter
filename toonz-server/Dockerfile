FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
# ffmpeg (with libass) assembles the reels; the Noto fonts let captions render in every supported language.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-noto-cjk fonts-noto-ui-core \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
VOLUME /data
EXPOSE 8080
CMD ["node", "dist/index.js"]
