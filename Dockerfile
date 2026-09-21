# Build stage (context = this repo's root)
FROM node:22-alpine AS build
WORKDIR /app
# Prisma needs OpenSSL present to pick the right engine build for Alpine.
RUN apk add --no-cache openssl
# shared/ is a vendored local package ("file:shared"); its manifest must exist
# before npm install so the symlink can be created.
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
RUN npm install --ignore-scripts
COPY . .
RUN npm run build:shared \
 && npx prisma generate \
 && npx tsc -p tsconfig.json

# Runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 4000
# Apply migrations, seed idempotently (never fatal), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && (npx prisma db seed || true) && node dist/src/server.js"]
