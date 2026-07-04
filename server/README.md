# Order Intelligence — Server

Express API. Implemented so far: **Product Catalog** module (upload + status).
Everything else (matching, mappings, export) is still contract-only.

## Implemented endpoints (v1)

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/catalog` | Upload CSV, replace catalog (multipart, field `file`) |
| GET | `/api/v1/catalog/status` | Active catalog metadata (or `status: "none"`) |

All follow [docs/api/v1.md](../docs/api/v1.md), including the standard error
envelope `{ error: { code, message, details, requestId } }`.

## Requires MongoDB

Set `MONGODB_URI` in `.env` (local or MongoDB Atlas). The server still boots if
the DB is unreachable, but catalog routes return `503 SERVICE_UNAVAILABLE` until
a connection is established.

## Structure

```
server/
├── package.json
├── .env.example
└── src/
    ├── index.js               # entry point — boots app, starts listener
    ├── app.js                 # express app factory (middleware + routes)
    ├── config/
    │   └── env.js             # environment configuration
    ├── routes/
    │   └── index.js           # /api router (health only for now)
    ├── controllers/
    │   └── healthController.js # GET /api/health
    ├── middleware/
    │   ├── notFound.js        # 404 handler
    │   └── errorHandler.js    # centralized error handler
    ├── services/              # (future) domain logic — empty
    └── models/                # (future) data models — empty
```

## Run

```bash
cd server
cp .env.example .env
npm install
npm run dev      # node --watch src/index.js
```

Then `GET http://localhost:4000/api/health` returns `{ "status": "ok", ... }`.
