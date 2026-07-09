# Order Intelligence — Server

Express + MongoDB REST API. All responses use the standard error envelope
`{ error: { code, message, details, requestId } }` on failure.

## Endpoints (v1)

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Health check (also `/api/health`) |
| POST | `/api/v1/catalog` | Upload CSV, replace the catalog (multipart, field `file`) |
| GET | `/api/v1/catalog/status` | Active catalog metadata (or `status: "none"`) |
| GET | `/api/v1/catalog/products?query=&limit=` | Search the catalog |
| POST | `/api/v1/resolve` | Resolve email products against mappings + matching engine |
| POST | `/api/v1/mappings` | Create an approved mapping |
| GET | `/api/v1/mappings` | List/search mappings (paginated) |
| PATCH | `/api/v1/mappings/:id` | Correct or retire a mapping |
| POST | `/api/v1/orders` | Save (upsert) an order by Portal Order Ref |
| GET | `/api/v1/orders?query=` | List saved orders (summary) |
| GET | `/api/v1/orders/:ref` | Full order detail |
| PATCH | `/api/v1/orders/:ref` | Update an order's resolution snapshot |
| PATCH | `/api/v1/orders/:ref/comments` | Set per-product comments |
| PATCH | `/api/v1/orders/:ref/fulfillment` | Set per-product Pending Qty / Order Status |

## Configuration

Copy `.env.example` to `.env`. Required: `MONGODB_URI` (+ `MONGODB_DB`).
Production: `CLIENT_URL` (CORS allowlist for the deployed frontend) and
optionally `API_KEY` (when set, all non-health requests need a matching
`X-API-Key` header).

The server boots even if MongoDB is unreachable — health stays up and
DB-backed routes return 503 until a connection is established.

## Run

```bash
npm install
npm run dev      # node --watch src/index.js → http://localhost:4000
npm test         # node --test
```

## Structure

```
src/
├── index.js         # entry point — boots app, connects DB, listens
├── app.js           # express app factory (CORS, API key, routes, errors)
├── config/          # env.js, db.js
├── routes/v1/       # catalog, mappings, resolve, orders
├── controllers/     # request validation + response shaping
├── services/        # domain logic (catalog, resolve, mappings, orders)
├── models/          # Product, CatalogMeta, ApprovedMapping, Order
├── middleware/      # requestId, apiKey, upload (multer), notFound, errorHandler
└── utils/           # AppError, ensureDb, normalizeName, displayName
scripts/             # operational tools (sync mappings, backfill orders) — dry-run by default
test/                # node:test suites (48 tests)
```
