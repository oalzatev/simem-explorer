# SIMEM Explorer

[![CI](https://github.com/oalzatev/simem-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/oalzatev/simem-explorer/actions/workflows/ci.yml)

Herramienta web para explorar y descargar datos del mercado eléctrico colombiano a través de la API pública de **XM/SIMEM** (Sistema de Información del Mercado de Energía Mayorista).

## ¿Qué hace?

- Consulta datos históricos del mercado eléctrico de Colombia
- Visualiza series de tiempo con gráficas interactivas
- Calcula estadísticas descriptivas (min, max, media, desv. estándar)
- Exporta datos como CSV con columnas enriquecidas por variable
- Guarda consultas en caché local para no repetir llamadas a la API
- Gestiona presets de consultas frecuentes

## Variables disponibles

| Categoría | Variable | Dataset ID |
|---|---|---|
| **Precios** | Precio de Bolsa Ponderado (TARGET) | 96D56E |
| **Precios** | Máximo Precio Ofertado (MPO Nacional) | 03ba47 |
| **Precios** | Precio de Escasez Ponderado | 43D616 |
| **Demanda** | Demanda Comercial del Sistema | d55202 |
| **Generación** | Generación Real por Tipo (Hidro/Térmica/Solar/Eólica) | E17D25 |
| **Hidrología** | Aportes Hídricos en Energía | BA1C55 |
| **Hidrología** | Aportes Hídricos en % (vs. media histórica) | 34FFDA |
| **Hidrología** | Reservas Hidráulicas en % de capacidad útil | 843497 |

## Instalación

### Opción 1: Docker (recomendado)

**Requisitos:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# Clonar el repositorio
git clone https://github.com/oalzatev/simem-explorer.git
cd simem-explorer

# Levantar la app
docker-compose up -d

# Abrir en el navegador
open http://localhost:5000
```

Los archivos CSV exportados se guardan en la carpeta `./exports/` del directorio del proyecto.

Para detener la app:
```bash
docker-compose down
```

### Opción 2: Node.js local

**Requisitos:** [Node.js 20+](https://nodejs.org/)

```bash
# Clonar el repositorio
git clone https://github.com/oalzatev/simem-explorer.git
cd simem-explorer

# Instalar dependencias
npm install

# Crear tablas de la base de datos
npx drizzle-kit push

# Iniciar en modo desarrollo
npm run dev
```

Abre [http://localhost:5000](http://localhost:5000) en tu navegador.

> **Windows:** Si ves el error `NODE_ENV no se reconoce`, asegúrate de que `cross-env` está instalado (`npm install cross-env --save-dev`).

## Variables de entorno

Copia `.env.example` como `.env` y ajusta:

```bash
cp .env.example .env
```

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `5000` | Puerto del servidor |
| `SIMEM_EXPORT_PATH` | `./exports` | Carpeta donde se guardan los CSV |
| `NODE_ENV` | `production` | Entorno de ejecución |

## Uso

1. **Selecciona variables** en la sidebar izquierda (hasta 5 a la vez)
2. **Define el rango de fechas** (la app maneja automáticamente el límite de 31 días de la API)
3. **Haz clic en Consultar** para cargar los datos
4. **Explora** las gráficas, estadísticas y correlaciones
5. **Exporta** los datos como CSV o guarda directamente en disco

### Notas sobre los datos

- La API SIMEM acepta máximo 31 días por consulta — la app lo divide automáticamente
- Las consultas quedan en caché local (SQLite) para no repetir llamadas
- Datasets horarios (Demanda, MPO) se agregan a **promedio diario** para la visualización
- Los CSV exportados incluyen columnas enriquecidas por variable (ej: `gen_hidro`, `gen_termica`, `ratio_hidro` para Generación Real)

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18, Tailwind CSS v3, shadcn/ui, Recharts |
| Backend | Express.js, TypeScript |
| Base de datos | SQLite (Drizzle ORM) |
| Build | Vite 5 |
| Contenedor | Docker + Docker Compose |
| CI/CD | GitHub Actions |

## Estructura del proyecto

```
simem-explorer/
├── client/              # Frontend React
│   └── src/
│       ├── pages/       # Explorer, Presets
│       ├── components/  # Sidebar, UI components
│       └── lib/         # Query client, theme
├── server/              # Backend Express
│   ├── routes.ts        # API endpoints + lógica de agregación SIMEM
│   ├── storage.ts       # Capa de datos (Drizzle + SQLite)
│   └── index.ts         # Entry point
├── shared/
│   └── schema.ts        # Modelos de datos compartidos
├── Dockerfile           # Imagen multi-stage
├── docker-compose.yml   # Orquestación
└── .env.example         # Variables de entorno de ejemplo
```

## API

El backend expone los siguientes endpoints:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/datasets` | Lista datasets agrupados por categoría |
| GET | `/api/datasets/:id/data` | Consulta datos con caché |
| GET | `/api/datasets/:id/data/export` | Descarga CSV |
| POST | `/api/datasets/save-to-disk` | Guarda CSV en disco del servidor |
| POST | `/api/datasets/concatenate` | Concatena múltiples CSVs |
| GET | `/api/presets` | Lista presets guardados |
| POST | `/api/presets` | Crea un preset |
| DELETE | `/api/presets/:id` | Elimina un preset |
| GET | `/api/config` | Configuración actual (ruta de exports) |
| POST | `/api/config` | Actualiza configuración |

## Fuente de datos

Los datos provienen de la **API pública de XM/SIMEM**:
- Documentación: [sinergox.xm.com.co](https://sinergox.xm.com.co)
- Endpoint base: `https://www.simem.co/backend-files/api/PublicData`
- Licencia: datos públicos del Operador del Sistema Interconectado Nacional (XM S.A. E.S.P.)

## Licencia

MIT
