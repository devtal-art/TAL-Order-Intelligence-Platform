# Order Intelligence Platform

Internal tool that turns saved HTML order emails into formatted Excel workbooks,
with a product catalog, an approved-mapping database, delivery tracking, and a
searchable order history — **React + Vite** frontend, **Node + Express +
MongoDB** backend.

## Features

- **HTML order upload** — single file or a batch of up to 50; parsing happens
  fully client-side.
- **Product resolution** — each email product is matched against the Approved
  Mapping database (instant 100% match) or scored against the website catalog
  by a hybrid matching engine (suggestion only, never auto-approved).
- **Manual approval** — approve the suggestion or search the catalog; approvals
  are remembered as mappings and apply to all future orders.
- **Website product catalog** — CSV upload (item_no, name, optional option
  column shown as "Name (Option)").
- **Order history** — every upload is saved to MongoDB keyed by Portal Order
  Ref; searchable, viewable, re-exportable.
- **Delivery tracking** — per-product Pending Quantity and Order Status
  (Delivered / Half Delivered / Not Delivered), editable on saved orders.
- **Product comments** — Released / OS / N/A per product.
- **Excel export** — one workbook per order (or a ZIP for batches).

## Monorepo layout

```
.
├── client/     # React + Vite frontend (Vercel)
└── server/     # Express + MongoDB REST API (Render)
```

## Development

```bash
# API — http://localhost:4000  (needs MongoDB; see server/.env.example)
cd server && npm install && npm run dev

# App — http://localhost:5173
cd client && npm install && npm run dev
```

Server tests: `cd server && npm test`.

## Deployment

**Backend (Render)** — root `server`, build `npm install`, start `npm start`,
health check `/api/v1/health`. Env vars: `MONGODB_URI`, `MONGODB_DB`,
`CLIENT_URL` (the Vercel origin, for CORS), `NODE_ENV=production`, and
optionally `API_KEY` (see below).

**Frontend (Vercel)** — root `client`, framework Vite (build `npm run build`,
output `dist`; `vercel.json` provides the SPA rewrite). Env vars:
`VITE_API_BASE_URL=https://<render-service>.onrender.com/api` and, if the
server sets one, `VITE_API_KEY`.

**API key (optional)** — setting `API_KEY` on the server requires every API
request to carry a matching `X-API-Key` header; the client sends it when
`VITE_API_KEY` is set. Leave both unset for open access during development.

## Operational scripts (`server/scripts/`)

- `sync-approved-products.js` — sync the ApprovedMapping collection with an
  "Approved Products" sheet (dry run by default, `--apply` to write).
- `backfill-order-resolutions.js` — re-sync saved orders' resolution snapshots
  with the current mappings after a mapping correction (dry run by default).
