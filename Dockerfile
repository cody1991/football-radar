# syntax=docker/dockerfile:1.7
# Football Radar all-in-one image: 同一镜像可作 web 用，也可作 scheduler 用，
# docker-compose 通过不同 command 区分。

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production
# better-sqlite3 是 native 模块，需要 build tools；ca-certificates 用于 https fetch；tzdata 用于时区
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        tzdata \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM base AS runtime
COPY --from=builder /app /app
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000

# 默认起 web。scheduler 容器通过 compose 的 command 覆盖。
CMD ["npm", "start"]
