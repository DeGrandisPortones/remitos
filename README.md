# App de Remitos (Express + React/Vite)

App simple para **buscar remitos por número** y **generar/abrir el PDF** listo para imprimir.

## Estructura

- `server/` → Node + Express + SQL Server (`mssql`) + PDF (`pdfkit`)
- `client/` → React + Vite

## Requisitos

- Node.js 18+ (recomendado 20+)
- Acceso a SQL Server con las tablas:
  - `dbo.REMITOS` (cabecera)
  - `dbo.IREMITOS` (ítems)

La app busca por `numero` en `REMITOS` (puede devolver varios por `tipo/sucursal`). Para los ítems, primero intenta por `tipo + sucursal + numero` y, si no encuentra renglones, hace fallback por `numero` (y por `numero + deposito` cuando aplica).

## Levantar en desarrollo

### 1) Servidor

```bash
cd server
npm install
cp .env.example .env
# Editar .env con tu SQL Server
npm run dev
```

Servidor por defecto: `http://localhost:3001`

### 2) Front

```bash
cd client
npm install
npm run dev
```

Front por defecto: `http://localhost:5173` (usa proxy a `/api` → `http://localhost:3001`).

## Endpoints

- `GET /api/health`
- `GET /api/remitos/search?numero=123` → lista cabeceras (por duplicados de número)
- `GET /api/remitos/:tipo/:sucursal/:numero` → JSON cabecera + ítems
- `GET /api/remitos/:tipo/:sucursal/:numero/pdf` → PDF listo para imprimir

## Producción (opcional)

1. Construir el front:

```bash
cd client
npm run build
```

2. Servir el front desde Express:

En `server/.env`:

```
SERVE_CLIENT=true
```

Y ejecutar:

```bash
cd server
npm start
```

## Notas

- Si tu SQL Server usa **instancia nombrada**, podés completar `SQL_INSTANCE_NAME` en el `.env` del server.
- El PDF es "simple" (PDFKit) pero listo para imprimir; si querés un formato idéntico a un preimpreso, conviene pasar a HTML + Puppeteer.
