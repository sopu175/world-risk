<div align="center">

# 🌍 WorldRisk Atlas

**A transparent, open-source global map and analytical platform for environmental hazards, live observations, and documented disaster events.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1+-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-v5-396B9C?logo=maplibre)](https://maplibre.org/)
[![Staging CI & Auto-Merge](https://github.com/sopu175/world-risk/actions/workflows/staging-auto-merge.yml/badge.svg)](https://github.com/sopu175/world-risk/actions/workflows/staging-auto-merge.yml)

Explore seismic activity, extreme wind & gusts, ocean wave heights, active wildfires, flood vectors, tropical cyclones, and volcanic events on a responsive live vector map. Inspect any coordinate or city for historical seismic exposure, extreme-heat climatology, and PM2.5 air quality — with full methodology, provenance, and data licensing transparently cited for every number.

*Zero fabricated risk scores · Zero simulated events · Zero arbitrary red/green hazard ratings.*

---

</div>

## 📑 Table of Contents

- [Overview & Philosophy](#-overview--philosophy)
- [Key Features](#-key-features)
- [Data Providers & Provenance](#-data-providers--provenance)
- [Tech Stack](#-tech-stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the Application](#running-the-application)
- [Data Pipeline & Scheduler](#-data-pipeline--scheduler)
- [Contributing Guide](#-contributing-guide)
  - [Branching Model (`feature` → `staging` → `main`)](#branching-model)
  - [Local Development Workflow](#local-development-workflow)
  - [Commit Message Conventions](#commit-message-conventions)
  - [Pull Request Checklist](#pull-request-checklist)
- [License & Acknowledgments](#-license--acknowledgments)

---

## 💡 Overview & Philosophy

Most commercial risk mapping tools produce proprietary, opaque risk indices that aggregate different perils into a single subjective number (e.g., "78/100 Hazard Score"). This creates a false sense of precision, obscures uncertainty, and prevents users from verifying how conclusions were reached.

**WorldRisk Atlas takes the opposite approach:**
1. **Source-Backed Only:** Every single observation or disaster event links directly to the originating open data source with its native provider ID.
2. **Honest Gaps:** If a hazard feed lacks validated real-time open data (e.g. landslides or droughts), the layer is clearly labelled as **Unavailable** with an explanation of evaluated candidate sources, rather than substituting synthetic estimates.
3. **Reproducible Climatology:** Extreme heat and wind climatology calculations use the peer-reviewed ERA5 reanalysis archive (Copernicus C3S / ECMWF) spanning 1995–present.
4. **Geospatial Rigor:** Country-level records are never represented as hyper-local predictions.

---

## ⚡ Key Features

- 🗺️ **High-Performance Vector Map:** Built with MapLibre GL v5 and OpenFreeMap vector basemaps (Positron and Dark). Features magnitude-proportional seismic circles, active disaster halos, cluster rendering, and coordinate inspection.
- 🧭 **Location Analytics:** Click anywhere or search any city to generate an instant profile:
  - **Seismic History:** Earthquakes ($M \ge 4.5$) within 300 km over a 10-year baseline via USGS FDSN.
  - **Extreme Heat Climatology:** Annual hot days count ($T_{\text{max}} \ge 35^\circ\text{C}$ or $40^\circ\text{C}$) since 1995, decadal trends, and baseline comparisons via ERA5.
  - **Wind Dynamics:** 10 m wind speeds, gusts, and directional vectors with historical peak distributions.
  - **Air Quality:** 72-hour rolling PM2.5 concentrations via Copernicus Atmosphere Monitoring Service (CAMS).
- 🗂️ **Extensible Layer Registry:** 11 distinct hazard layers with granular metadata covering methodology, physical units, spatial resolution, temporal frequency, and provider licensing.
- 📰 **Documented Disaster Events:** Chronological timeline tracking natural disaster events, severity measures, reporting agencies, and verification statuses (`source_reported` vs. `cross_verified`).
- 🔄 **Autonomous Ingestion Engine:** In-app background scheduler running inside Next.js instrumentation with jittered exponential backoff, upsert deduping, and a complete audit trail (`/api/ingest/runs`).

---

## 📡 Data Providers & Provenance

WorldRisk Atlas operates exclusively on open data. Attribution is maintained across the UI, API, and documentation:

| Provider | Data Stream & Usage | License | Citation Link |
| :--- | :--- | :--- | :--- |
| **U.S. Geological Survey (USGS)** | M2.5+ earthquake observations (30-day feed) and 10-year seismic catalog | Public Domain (U.S. Gov) | [earthquake.usgs.gov](https://earthquake.usgs.gov) |
| **NASA EONET v3** | Wildfires, severe storms, floods, and 5-year volcanic activity archive | Public Domain (NASA) | [eonet.gsfc.nasa.gov](https://eonet.gsfc.nasa.gov) |
| **Open-Meteo (ECMWF / NOAA)** | Global wind & gusts (10 m speed, gusts, direction on 10° grid) | CC-BY 4.0 | [open-meteo.com](https://open-meteo.com) |
| **Open-Meteo (ERA5 / Copernicus)** | Extreme heat climatology (daily $T_{\text{max}}$) and annual peak wind history | CC-BY 4.0 | [open-meteo.com/en/docs/historical-weather-api](https://open-meteo.com/en/docs/historical-weather-api) |
| **Open-Meteo (CAMS / Copernicus)** | PM2.5 atmospheric air quality concentrations (72 h) | CC-BY 4.0 | [open-meteo.com/en/docs/air-quality-api](https://open-meteo.com/en/docs/air-quality-api) |
| **Open-Meteo (ECMWF WAM)** | Ocean wave dynamics (significant wave height on 10° ocean grid) | CC-BY 4.0 | [open-meteo.com/en/docs/marine-weather-api](https://open-meteo.com/en/docs/marine-weather-api) |
| **OpenStreetMap & Nominatim** | Reverse geocoding for map coordinate resolution (≤1 req/s, 24 h cached) | ODbL 1.0 | [nominatim.openstreetmap.org](https://nominatim.openstreetmap.org) |
| **OpenFreeMap** | Clean vector map tiles (Positron & Dark themes, no API key required) | OpenMapTiles / OSM | [openfreemap.org](https://openfreemap.org) |
| **ReliefWeb (UN OCHA)** | Disaster event narrative enrichment *(activated via `RELIEFWEB_APPNAME`)* | Attribution | [apidoc.reliefweb.int](https://apidoc.reliefweb.int) |
| **NASA FIRMS** | Satellite thermal anomalies *(activated via `FIRMS_MAP_KEY`)* | Public Domain | [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov) |

---

## 🛠 Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, standalone production target)
- **Runtime & Package Manager:** [Bun](https://bun.sh/) (or Node.js 20+)
- **Language:** TypeScript 5 (Strict Mode)
- **ORM & Database:** Prisma 6 with SQLite (`db/custom.db`) for local/preview builds; PostgreSQL 15 + PostGIS 3 DDL available in `docs/schema-postgis.sql`
- **Styling & UI:** Tailwind CSS v4, Radix UI accessible primitives, Lucide Icons
- **Mapping:** MapLibre GL v5, MapLibre RTL Text Plugin
- **Visualizations:** Recharts (responsive sparklines and distributions)
- **State Management:** TanStack React Query v5 & Zustand v5

---

## 📂 Repository Structure

```text
world-risk/
├── .github/
│   └── workflows/
│       └── staging-auto-merge.yml # Automated CI pipeline & staging-to-main merger
├── db/
│   └── custom.db                 # Seeded SQLite database (3,600+ real records)
├── docs/                         # PostGIS schema and system architecture notes
├── prisma/
│   └── schema.prisma             # Prisma data models & datasource definitions
├── public/                       # Static public assets (icons, images)
├── src/
│   ├── app/                      # Next.js App Router (pages & REST API endpoints)
│   │   ├── api/                  # Backend endpoints (/events, /observations, /locations, etc.)
│   │   ├── globals.css           # Tailwind v4 styles and color variables
│   │   ├── layout.tsx            # Global shell and font configuration
│   │   ├── page.tsx              # Application entrypoint rendering AtlasShell
│   │   └── providers.tsx         # React Query & Theme providers
│   ├── components/
│   │   ├── atlas/                # Domain-specific map panels and data views
│   │   │   ├── AtlasShell.tsx    # Responsive application coordinator & sidebar tabs
│   │   │   ├── MapView.tsx       # MapLibre GL map viewport, layers & popups
│   │   │   ├── LocationPanel.tsx # Location deep-dive (seismic, heat, wind, air)
│   │   │   ├── LayerPanel.tsx    # Layer visibility, filters, and layer metadata
│   │   │   ├── EventsPanel.tsx   # Chronological disaster event explorer
│   │   │   ├── MethodologyPanel.tsx # Methodology explanations & data source citations
│   │   │   └── charts.tsx        # Climatology and trend graphs
│   │   └── ui/                   # Reusable UI primitives (dialog, button, tooltip, etc.)
│   ├── instrumentation.ts        # Next.js startup hook bootstrapping scheduler
│   └── lib/
│       ├── db.ts                 # Prisma Client singleton
│       ├── geo.ts                # Geodesic math, bounding box & distance utilities
│       ├── store.ts              # Zustand global client state
│       ├── ingest/               # Modular ingestion pipeline adapters
│       └── services/             # Analytics and location intelligence services
├── workers/
│   └── ingest-worker.py          # Optional standalone Python polling daemon
├── .env.example                  # Template configuration file
├── package.json                  # Scripts & dependencies
└── tsconfig.json                 # TypeScript compiler configuration
```

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) $\ge 1.1$ (recommended) or [Node.js](https://nodejs.org/) $\ge 20$
- [Git](https://git-scm.com/)

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sopu175/world-risk.git
   cd world-risk
   ```

2. **Install project dependencies:**
   ```bash
   bun install
   # or: npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   *Note: The app runs out-of-the-box with default values. All API keys are completely optional.*

### Database Setup

The repository ships with an initial SQLite database (`db/custom.db`) containing verified historical events and real observations.

Generate the Prisma client and verify schema synchronization:
```bash
# Push schema and generate Prisma client
bun run db:push

# Or generate Prisma client standalone
bun run db:generate
```

### Running the Application

Start the local development server:
```bash
bun run dev
# or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The application will automatically bootstrap its ingestion catalog and display the live atlas.

---

## 🔄 Data Pipeline & Scheduler

The application keeps its hazard layers updated through multiple supported ingestion triggers:

1. **In-App Scheduler (Default):** Executed by `src/instrumentation.ts` when Next.js boots. Every 15 minutes, it checks which data feeds have passed their refresh cadence (e.g. USGS every 3 h, wind grid every 3 h, EONET every 6 h).
2. **Manual Ingestion Trigger:** Trigger a fresh fetch for any registered source at any time:
   ```bash
   curl -X POST http://localhost:3000/api/ingest/run \
     -H "Content-Type: application/json" \
     -d '{"sourceKey": "usgs-earthquakes"}'
   ```
3. **Audit Trail:** Inspect full import logs, record counts, and failure statuses via `GET /api/ingest/runs`.

---

## 🤝 Contributing Guide

We welcome contributions from developers, researchers, climatologists, and geospatial enthusiasts! To maintain codebase quality and continuous delivery, we follow a structured git workflow.

### Branching Model

```text
[ Feature / Bugfix Branch ]  (e.g., feature/hazard-clustering)
             │
             ▼  Pull Request / Push
      [ staging ]           (Integration branch)
             │
             ├──▶ GitHub Actions: Lint + Prisma Check + Build
             │
             ▼  Automated Merge (if all checks PASS)
       [ main ]             (Production branch)
```

1. **`main`**: Production-ready, stable codebase. Direct commits to `main` should be avoided.
2. **`staging`**: Active integration branch. Pushes to `staging` automatically trigger GitHub Actions. Once tests and builds pass, GitHub Actions **automatically merges `staging` into `main`**.
3. **`feature/<name>`** or **`fix/<name>`**: Working branches created off `staging`.

### Local Development Workflow

1. **Fork & clone** the repository.
2. **Checkout a new branch** from `staging`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following code standards.
4. **Validate locally before pushing:**
   ```bash
   # Run linter
   bun run lint

   # Validate build
   bun run build
   ```
5. **Commit your changes** following the [Conventional Commits](#commit-message-conventions) specification.
6. **Push to your fork** and submit a Pull Request targeting the **`staging`** branch.

### Commit Message Conventions

We use standard Conventional Commits to maintain a clean git history:

- `feat:` A new feature or hazard layer capability
- `fix:` A bug fix or data parsing patch
- `docs:` Documentation or README updates
- `style:` Formatting or UI styling changes (no logic changes)
- `refactor:` Code refactoring that neither fixes a bug nor adds a feature
- `perf:` Performance improvements (e.g. MapLibre layer optimizations)
- `test:` Adding or updating tests
- `chore:` Maintenance tasks, dependency bumps, or workflow configurations

*Example:* `feat: add cluster radius controls for seismic observation layer`

### Pull Request Checklist

Before submitting a PR, please ensure:
- [ ] Code compiles without TypeScript errors (`bun run build`).
- [ ] Linter passes with zero warnings or errors (`bun run lint`).
- [ ] No private API tokens or credentials are committed.
- [ ] Any new data sources adhere to open licensing requirements (CC, Public Domain, or ODbL).
- [ ] UI modifications are tested on both desktop and mobile viewports (down to 390 px width).

---

## 📄 License & Acknowledgments

- **Platform Code:** Released under the [MIT License](LICENSE).
- **Hazard & Geospatial Data:** Each dataset retains the terms of its original open license (USGS Public Domain, NASA Public Domain, Open-Meteo CC-BY 4.0, OpenStreetMap ODbL). Redistributing data extracted from the application must comply with the originating provider's terms.
- Built with dedication to open science, climate transparency, and public safety.
