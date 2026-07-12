# ---- Build Stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install all dependencies (including devDeps for Prisma generate + tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Generate Prisma client (outputs to src/generated/prisma/)
COPY prisma ./prisma
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- Runtime Stage ----
FROM node:22-alpine
WORKDIR /app

# Install production deps, then add tsx (needed for module: "preserve" imports) and @prisma/client (devDep but required at runtime)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm install @prisma/client tsx && \
    rm -rf /root/.npm /tmp/*

# Copy compiled JS (tsc compiled Prisma v7 .ts output to dist/generated/prisma/)
COPY --from=build /app/dist ./dist

# Copy Prisma schema (needed for any runtime introspection)
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npx", "tsx", "dist/main.js"]
