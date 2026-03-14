FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy application
COPY server.js ./
COPY server/ ./server/
COPY api/ ./api/
COPY lib/ ./lib/
COPY public/ ./public/
COPY locales/ ./locales/
COPY scripts/ ./scripts/

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
