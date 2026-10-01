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
- DWG: read on the server by GNU **LibreDWG** `dwg2dxf` (0.14 dev release — 0.13.3 lost the ENTITIES section of real AutoCAD 2013 files) (open source, GPL-3, built in the Dockerfile's `libredwg` stage, run as a separate program via `lib/floor-plans/dwg.ts`). Original kept as `original.dwg`, converted `source.dxf` used by the viewer. Keep the drawing's own DXF version (forcing `--as r2000` drops entities from 2007+ files). CI job `docker` builds the image so a broken LibreDWG build never deploys.
- DXF read in the browser with `dxf-parser` (MIT): `lib/floor-plans/dxf.ts` (blocks/INSERTs expanded, arcs/bulges tessellated, units from $INSUNITS). Layers get roles (walls / columns / slab outline / openings / ignore, suggested from layer names) → automatic quantities. "Plan region" box excludes sections/elevations drawn in the same file.
- PDF rendered with `pdfjs-dist` legacy build (worker via `new URL(...)`); pictures drawn to canvas. Scale set by clicking a known dimension.
- Tools: Set scale, Measure (use as floor height / slab thickness — for section drawings), Slab area, Opening, Wall (centre line), Column, Select; columns & beams by size tables.
- Formulas (`lib/floor-plans/calc.ts`, per floor) follow ACOFORM's own sheet (GHB PMAY Gorwa check: 406.89 + 1654.73 + 53.59 + 100 = 2215.21, +10% = 2436.7): slab = slab area − wall tops − ducts (− columns); walls = face length × (floor height − slab); beams = side length × (depth − slab) (bottom already in slab); staircase/other lump sums; optional edges; Add %. Full-set quick quotes use `quote_area`, vertical sets `vertical_area`.
- `cleanDxfText` re-joins values that LibreDWG splits across lines (long MTEXT notes) — otherwise dxf-parser hangs.
- Tables/cols (migrations 00038–00039): `floor_plans` (takeoff, totals, preview_path, drawing_type, original_path), `quotations.floor_plan_id`, RPC `set_quotation_floor_plan`, copied on revisions.
- Quotation: "Use in quotation" on the plan (quick quotes: floor plate → Full set, walls+columns → Vertical set) and "Quick quote from plan" (`/quotations?lead=..&mode=quick&plan=..`). Attached plan prints as page "PROJECT FLOOR PLAN & FORMWORK AREA" (preview.jpg + area table).
- Panel design hand-off: "Send walls to panel design" turns each drawn wall segment into `design_walls` (height must be 2400–3000 mm); then run the layout engine / BOM in the design.

## Shell plan (Sep 2026) — on the floor plan screen, panel "Shell plan"
- Elements: walls (thk/height), doors & windows (2 clicks on the wall; height, sill), beams (b×D), columns, slabs (thk, level − sunk), ducts, lofts (thk, level). Codes S/W/DR/WN/B/C/L/D, own names allowed.
- Area list rules added: door/window faces deducted from walls (2 × w × h), concrete reveals added ((2h + w [+w for windows]) × wall thk); lofts = soffit + edge.
- `/floor-plans/[id]/shell-plan` → A3 PDF (lib/pdf/shell-plan-document.tsx: plan drawing via react-pdf Svg, door/window/beam/slab/wall schedules, area summary, legend, notes, title block with client approval box); `?format=dxf` → R12 DXF (layers SHELL-*) in the client's own drawing coordinates so it overlays their plan (lib/floor-plans/shell.ts).
- Title block fields stored in `takeoff.shell` (drawingNo, rev, drawnBy, checkedBy, notes).

## Panel layout & BOM (Sep 2026) — "Panel layout & BOM →" on the floor plan screen
- Engine: `lib/design-engine/floor-panels.ts` (pure). Inputs from `lib/floor-plans/panel-input.ts` (drawn walls → 2 faces per segment; DXF wall lines in the plan region → 1 face per straight run; slabs with ducts as holes; beams from Beam tool / Beams table / DXF beam layer).
- Rules v1 (standard Mivan, to tune with ACOFORM drawings): fewest catalogue wall panels per face (50 mm DP), gaps < 25 mm taken in joints, faces ≤ 250 mm = stop-ends, walls taller than the standard panel get WT top strips, 65 mm corner per ~90° joint (IC/EC to confirm), deck strips of 1200 filled with 600/450/300 and scaled to net soffit, props @ spacing, soffit corner along top of faces, beam sides (D − slab) and bottoms (b) in 1200 lengths. Custom items weighed at kg/m² (default 20).
- Page `/floor-plans/[id]/panels` (options h, kg, prop in the query string) + `/panels/export?format=csv|pdf` (lib/pdf/panel-bom-document.tsx).
- Gorwa check: ≈ 3,018 m² of panels, 56.7 t, 18.8 kg/m² (quote says 19–21 kg/m²).

## Measurement rules (company settings)
- Table `measurement_rules` (tenant_id PK, rules jsonb), RLS: read by tenant, write by designs.approve or quotations.approve (migration 00041).
- `lib/floor-plans/rules.ts`: MeasureRules, DEFAULT_RULES (0.4 m² openings, edges, reveals, wall/column tops deducted, kicker 0, stairs, +10%), normaliseRules, describeRules, loadRules.
- `computeTotals(t, auto, rules)`: plan params override (minOpeningM2, includeEdges, extraPct); result carries `rules` snapshot, saved with totals.
- Settings → "Measurement rules"; take-off shows "Measurement rules used"; quotation PDF prints "MEASUREMENT BASIS" when printOnQuote.

## Component catalogue (market defaults) + accessories in the panel BOM
- Migration 00042: panel_master categories + soffit_corner, kicker, deck_beam, prop_head, accessory; columns `unit`, `description`; market-default rows seeded per tenant (WP 350/400/500, DP 400/500, IC-100, SC-100-1200, KP-100-1200, MB-100-1150, PH-100-230, PROP-3.5, PIN-16, WEDGE-6, FTIE-150, TR-16). area_sqm is generated.
- Panel catalog page: editable (panel_master.manage) — add / edit / stop using items (catalog-editor.tsx, item-actions.ts).
- floor-panels.ts: deck strip length = most common deck length; widest IC/EC; prop grid = (deck length + PH) × min(prop spacing, MB + PH), warns > 1.3 m; MB = PH = PROP count; soffit corner & kicker from catalogue (kicker along deck outline perimeter); pins & wedges = panel edge length / 600 × 1.05; wall ties from engineering tie spacing (default 800 × 800). summary.weight = panels only; summary.accessoryWeight separate.

## Automatic typical-floor pick
- DWG browser converter now also writes TEXT (TEXT/MTEXT, formatting stripped); lean DXF reader reads TEXT/MTEXT; DxfModel.texts.
- planCandidates scores drawings: wall count × title factor (title = biggest "plan/section/…" text in/below the box; "typical" ×4, section/elevation/site/parking/roof… ×0.25, long thin ×0.3); floors from titles like "2nd to 5th floor".
- floorHeightFromTexts: "FLOOR HEIGHT 3075" / "F.T.F" or the usual step between level marks (+3.075 / +3450MM), needs ≥2 equal steps.
- Take-off (editors): when no region is set and there are ≥2 drawings, the best one is picked automatically, floors / floor height applied if found, and the take-off is saved. "Choose another drawing" lets the user switch. Plans uploaded before this have no texts in source.dxf → re-upload for title detection (wall-count fallback still works).

## ACOFORM area calculation sheet (their hand format) + automatic beams, staircase, floor info
- /floor-plans/[id]/area-sheet → A3 PDF like ACOFORM's "TENTATIVE AREA CALCULATION": 1 slab − (wall top + duct), 2 wall length × (H − slab), 3 beam length × (D − slab), 4 staircase, 5 columns, total =1+2+3+4, ADD x%, all floors. lib/floor-plans/area-sheet.ts + lib/pdf/area-sheet-document.tsx.
- geom.wallGaps: wall ends facing each other in line (same thickness, 0.45–3.6 m) = openings; computeTotals adds "Beams over N wall openings (auto)" = 2 × span × (D − slab) unless beams are typed in (params.autoLintels=false turns it off). Gorwa: 112.48 m vs sheet 119.09.
- Staircases: stair-layer clusters ≥ 2×2 m (auto.stairBoxes); company rule stairAllowanceM2 (default 100) per staircase unless stairs/extras entered.
- floorInfoFromTexts: floor height from notes / level marks (incl. first-to-top levels ÷ n with a round 25 mm result: Gorwa +3450…+43425 → 3075, 14 slabs); "G+N" text → floors. Take-off applies them when still at defaults (3000 mm / 1 floor) and saves.
- Default rule slabEdges = false (ACOFORM sheet does not add slab edges).
- Known gap: shafts not X-marked and not on a cut-out layer are not found (Gorwa sheet ducts 18.2 vs 9.72 auto) — draw them with the Opening tool. labelledSpaces() in geom.ts is an unused experiment.

## Typical-floor basis (Mivan) + non-typical additions
- One aluminium set is reused on all floors: no "all floors" multiplication anywhere. `floors` is info only.
- Takeoff.nonTypical rows (label, area_m2) = extra formwork for first floor / terrace / refuge etc., added once.
- Totals: typical_quote = contact × (1 + extra%); nontypical_area; quote_area = typical_quote + nontypical_area (the "Formwork set" used by quotations).
- Area sheet shows ADD x%, then "ADDITIONAL FOR NON-TYPICAL FLOORS" and "FORMWORK SET". Download buttons: plan page header, take-off sidebar, quotation floor-plan card.

## Panel BOM: lintel beams + staircase sets + specials summary
- panel-input: auto wall-opening gaps become beam runs "LB" (b = wall thickness, d = beam depth, 2 sides + bottom) when no beams are typed in — same rule as the area take-off. Staircase lines of the take-off (group "extra") go to the BOM as one custom "set" each (PanelOptions.stairSets).
- summary.specials {types, pcs, area} shown on the panels page ("Special panels (this project)").
- Gorwa check: 2,317 m² of panels, 17.8 kg/m², 75.5 % standard; specials mostly 525 mm wall tops (2925 clear − 2400).

## Take-off: automatic reading only once; no reload after Save
- Takeoff.auto {done, note}: the drawing-based auto pick / floor height / floors runs only on a plan's first opening (no region yet, auto not done). Never overwrites the user's values later.
- The plan file loads once per plan id (not per signed URL), so Save → router.refresh no longer re-reads the drawing.
- "Counting:" names the drawing the region covers (≥90 % of a detected drawing), also for hand-drawn regions.

## Estimator's own figures (override)
- params.slabM2 / ductM2 / wallLenM / beamLenM (+ existing wallTopM2) replace the drawing-read values in computeTotals; take-off panel "Use your own measured figures" shows the drawing value beside each box.
- Gorwa: entering 461.54 / 18.2 / 565.72 / 119.09 / 36.45 gives 2215.21 m² (+10 % = 2436.73) — identical to ACOFORM's sheet. Auto: 2192.83 (ducts 9.72 vs 18.2 — 4 shafts not detected; walls 555.52 vs 565.72; beams 112.48 vs 119.09; slab 463.52 vs 461.54).

## Wall modulation drawings
- /floor-plans/[id]/panels/modulation → A3 PDF: sheet 1 schedule of face types (identical faces grouped: M01 × n, length, height, panel string, top, filler, face codes); then elevations 2 × 3 per sheet at one common scale with panel widths, wall-top pieces, fillers (red), tie dots (engineering tie spacing), length/height dimensions. lib/pdf/modulation-document.tsx. Button "Modulation drawings PDF" on the panels page.
- Gorwa: 270 faces → 30 types, 6 sheets.
