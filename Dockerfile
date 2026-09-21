# Build stage — monorepo aware (context = repo root)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
RUN npm install --workspaces --include-workspace-root --ignore-scripts
COPY shared shared
COPY backend backend
RUN npm run build -w shared \
 && npx prisma generate --schema backend/prisma/schema.prisma \
 && npm run build -w backend

# Runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/node_modules ./backend/node_modules

WORKDIR /app/backend
EXPOSE 4000
# Apply migrations, seed idempotently, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed || true && node dist/src/server.js"]
