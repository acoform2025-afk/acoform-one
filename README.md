# ACOFORM ONE

ERP, design automation and MES for **Aco Form Work Pvt Ltd** (aluminium formwork, Ahmedabad).

- **App:** Next.js 15 (App Router, TypeScript, Tailwind), `@react-pdf/renderer` for quotation PDFs
- **Database:** Supabase project `hxlkinnosgckehogtpgb` — schema, RLS and business rules live in the database (migrations applied via the Supabase MCP)
- **Hosting:** Render (free web services, Docker), deployed automatically from GitHub

## How changes go live

| Branch | Deploys to | Use |
| --- | --- | --- |
| `test` | Render service `acoform-one-test` | check a change |
| `main` | Render service `acoform-one` | live app |

Every push runs a type check and production build on GitHub first; Render only deploys after it passes.
Services are defined in `render.yaml` (Render Blueprint). Free services sleep after ~15 min idle (first load ~1 min).

## Local development (optional)

```bash
cp .env.example .env.local   # fill in the anon/publishable key
npm install
npm run dev
```

Never put the Supabase `service_role` key in this app.

## Structure

- `app/(dashboard)/…` – screens (dashboard, leads, quotations, projects, panel catalog, settings)
- `app/(dashboard)/quotations/[id]/pdf` – techno-commercial proposal PDF
- `lib/quotations/document-content.ts` – standard proposal text (advantages, specs, accessories, T&C)
- `lib/types/database.ts` – generated Supabase types
