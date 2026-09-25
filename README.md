# ACOFORM ONE

ERP, design automation and MES for **Aco Form Work Pvt Ltd** (aluminium formwork, Ahmedabad).

- **App:** Next.js 15 (App Router, TypeScript, Tailwind), `@react-pdf/renderer` for quotation PDFs
- **Database:** Supabase project `hxlkinnosgckehogtpgb` — schema, RLS and business rules live in the database (migrations applied via the Supabase MCP)
- **Hosting:** Hugging Face Docker Spaces, deployed automatically by GitHub Actions

## How changes go live

| Branch | Deploys to | Use |
| --- | --- | --- |
| `test` | `huggingface.co/spaces/acodorm/acoform-one-test` | check a change |
| `main` | `huggingface.co/spaces/acodorm/acoform-one` | live app |

Every push runs a type check and production build first; a broken build never deploys.

One-time setup: repository secret **`HF_TOKEN`** = a Hugging Face access token with *write* permission for the `acodorm` account.

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
