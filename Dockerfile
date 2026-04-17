# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias primero (aprovecha cache de capas)
COPY package*.json ./
RUN npm ci

# Copiar código fuente y construir
COPY . .
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar artefactos del build
COPY --from=builder /app/dist ./dist

# Crear directorio de exports y datos
RUN mkdir -p /app/exports /app/data

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=5000
ENV SIMEM_EXPORT_PATH=/app/exports

# Exponer puerto
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Iniciar aplicación
CMD ["node", "dist/index.cjs"]
