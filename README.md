# Order Intelligence Platform

Internal tool that turns saved HTML order emails into formatted Excel workbooks —
migrated from a single static HTML file to a **React + Vite** frontend and a
**Node + Express** backend skeleton.

> This migration is structural only. The UI, user experience, HTML parser, and
> Excel generation behave exactly as before. No new features (CSV upload,
> MongoDB, product matching, mappings, APIs, auth) have been implemented.

## Monorepo layout

```
.
├── client/     # React + Vite frontend (the app)
└── server/     # Express + MongoDB backend (REST API)
```

## Frontend (`client/`)

```
client/
├── index.html                 # Vite entry
├── vite.config.js
├── .env.example               # VITE_API_BASE_URL (unused for now)
└── src/
    ├── main.jsx               # React root + router + global styles
    ├── App.jsx                # routes: / (Home), /review, /result
    ├── parser/parseOrderHTML.js   # PRESERVED — parser logic unchanged
    ├── excel/buildXLSX.js         # PRESERVED — workbook logic unchanged (XLSX now from npm)
    ├── hooks/useOrderProcessor.js # the original run() flow (parse → build → results/error)
    ├── components/            # TopBar, Layout, UploadStep, ProcessingView,
    │                          # ResultsView, ErrorView, CatalogSection,
    │                          # ReviewPlaceholderCard, DownloadStepCard, StepArrow
    ├── pages/                 # Home (working flow), Review + Result (placeholders)
    ├── services/              # apiClient — foundation for future API calls (unused)
    ├── utils/                 # format.js, timing.js (preserved)
    └── styles/                # the existing CSS, unchanged, aggregated by index.css
```

### Run

```bash
cd client
npm install
npm run dev      # http://localhost:5173
```

Build: `npm run build` → `dist/`.

## Backend (`server/`)

Express app factory with config, a health check, and error/404 middleware.
See [server/README.md](server/README.md). No business logic yet.

The v1 REST API contract (what both apps will build against) is specified in
[docs/api/v1.md](docs/api/v1.md) — documentation only, not yet implemented.

```bash
cd server
npm install
npm run dev      # http://localhost:4000/api/health
```

## What was preserved exactly

- **Parser** (`parseOrderHTML`) — copied verbatim; output object identical.
- **Excel generator** (`buildXLSX`) — logic verbatim; only the `XLSX` import
  changed from the CDN global to the `xlsx` npm package (same version, 0.18.5).
- **UI/CSS** — the same stylesheets and markup, ported to JSX class-for-class.
- **Flow & timings** — the upload → processing (animated steps) → results/error
  sequence, including the original delays and empty-data guard.
