# ACOFORM ONE – handoff notes (for the next Claude session)

**Status (28 Sep 2026):** app rebuilt from scratch (the original code was lost with the Windows PC).
All code is committed in this repo's git history. Database changes 00024–00032 are ALREADY applied
to the live Supabase project `hxlkinnosgckehogtpgb` (do not re-apply).

## Hosting (decided 28 Sep 2026)
- Hugging Face was dropped: new Docker Spaces need a paid plan on both HF accounts (402). User does not want PRO.
  NEVER touch the ACODOR Space (`acodor/acodor-door-erp-web`) – separate app.
- Now: **Render free plan**, defined in `render.yaml` (Blueprint): `main` -> `acoform-one` (live),
  `test` -> `acoform-one-test`. Render deploys after the GitHub "Check build" workflow passes.
- Free services sleep after ~15 min idle. Later: Cloudflare Zero Trust + custom domain like erp.acodor.com.
- The repo secret `HF_TOKEN` is no longer used and can be deleted.

## Database changes after the rebuild
- 00033 (28 Sep): `leads.project_name` added; lead numbers assigned automatically by trigger
  `trg_leads_assign_code` as `ACOFORM/LEAD/<FY>/001` (FY Apr–Mar). The app no longer sends `lead_code`.
- 00034 (28 Sep): `fill_quotation_from_lead` also copies `project_name`, and moves the lead to `quoted` when a
  quotation is created from it. Lead page has Create quotation / Quick quote (opens /quotations?lead=<id>[&mode=quick]).
- 00035 (29 Sep): `update_quotation_line` gained `p_rate_per_kg` (negotiated panel rate), new `update_quick_quote_rate`.
  Quotation page: edit bar, click-to-edit qty/rate on panel lines and quick quotes (draft/pending only; locked ones → revision).
- 00036 (29 Sep): `quotations.accessories` jsonb (null = standard list from lib/quotations/document-content.ts),
  RPC `set_quotation_accessories`; revisions copy it. Editor on the quotation page, PDF prints it via `accessoriesFor()`.
- UI (29 Sep): light theme via CSS vars (graphite/aluminium in globals.css), components/ui (Button, StatusBadge, DataTable on
  TanStack Table, PageHeader), grouped sidebar components/app-shell/app-sidebar.tsx. Leads + Quotations lists use DataTable.

## Built so far
Login, dashboard, settings (company, bank, engineering parameters, users), leads, quotations
(detailed + quick, accessory/transport/design lines, revisions R1/R2, proposal PDF with real logo),
projects, designs (walls → 3-strategy layout engine → server-side engineering check → approval),
BOM, production orders / work orders / QC with NCR, inventory, dispatch with delivery challan PDF,
returns and repairs.

## Waiting on the user (ACOFORM)
- Certified engineering parameters (Settings → Engineering) – designs cannot be approved until certified.
- Company legal name / GSTIN / bank details in Settings.
- Minimum custom-filler width and how to top walls above 2400 mm (layout rules).
- 4–6 site photos, optional signature/stamp PNG for PDFs.

## Quotation PDF — site photos & client logos (Sep 2026)
- New page after the Technical Specification: "OUR WORK AT SITE" (3 photos) + "OUR ESTEEMED CLIENTS" (logo grid).
- Managed in **Settings → Quotation pictures** (upload / rename / reorder / delete; max 3 photos, 12 logos). Needs quotations.approve.
- Migration 00037: table `quotation_media` (storage_path = `builtin:site/x.jpg` for files shipped in /public/brand, or `<tenant_id>/<file>` in the private storage bucket `quotation-media`, 5 MB, jpg/png), limit trigger, storage RLS by tenant folder.
- Browser resizes before upload (photos 1600px JPEG, logos 600px PNG) and uploads straight to Storage; server action `addMedia` records the row. PDF route loads them via `lib/quotations/media.ts` (`mediaForPdf`).
- Per-quotation switch: `quotations.show_references` (default true) via RPC `set_quotation_show_references` (draft/pending only); copied on revisions. UI: `references-toggle.tsx` on the quotation page.

## Floor plans & area take-off (Sep 2026) — sidebar "Floor plans & area"
- Upload: `/floor-plans/new` (from a lead or quotation). Files: DWG, DXF, PDF, JPG, PNG → private bucket `floor-plans` (`<tenant>/<plan id>/source.*`, 50 MB).
- DWG: read on the server by GNU **LibreDWG** `dwg2dxf` (open source, GPL-3, built in the Dockerfile's `libredwg` stage, run as a separate program via `lib/floor-plans/dwg.ts`). Original kept as `original.dwg`, converted `source.dxf` used by the viewer. Keep the drawing's own DXF version (forcing `--as r2000` drops entities from 2007+ files). CI job `docker` builds the image so a broken LibreDWG build never deploys.
- DXF read in the browser with `dxf-parser` (MIT): `lib/floor-plans/dxf.ts` (blocks/INSERTs expanded, arcs/bulges tessellated, units from $INSUNITS). Layers get roles (walls / columns / slab outline / openings / ignore, suggested from layer names) → automatic quantities. "Plan region" box excludes sections/elevations drawn in the same file.
- PDF rendered with `pdfjs-dist` legacy build (worker via `new URL(...)`); pictures drawn to canvas. Scale set by clicking a known dimension.
- Tools: Set scale, Measure (use as floor height / slab thickness — for section drawings), Slab area, Opening, Wall (centre line), Column, Select; columns & beams by size tables.
- Formulas (`lib/floor-plans/calc.ts`, per floor): clear height = floor height − slab; walls = both faces × clear height; columns = perimeter × clear height; slab soffit = plate − column footprints; edges = (slab + opening perimeters) × slab; beams = L × (b + 2 × (D − slab)).
- Tables/cols (migrations 00038–00039): `floor_plans` (takeoff, totals, preview_path, drawing_type, original_path), `quotations.floor_plan_id`, RPC `set_quotation_floor_plan`, copied on revisions.
- Quotation: "Use in quotation" on the plan (quick quotes: floor plate → Full set, walls+columns → Vertical set) and "Quick quote from plan" (`/quotations?lead=..&mode=quick&plan=..`). Attached plan prints as page "PROJECT FLOOR PLAN & FORMWORK AREA" (preview.jpg + area table).
- Panel design hand-off: "Send walls to panel design" turns each drawn wall segment into `design_walls` (height must be 2400–3000 mm); then run the layout engine / BOM in the design.
