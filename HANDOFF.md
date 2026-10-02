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

## Big DWG uploads
- Browser DWG→DXF skips layers that never carry formwork geometry (SKIP_LAYER in dwg-web.ts: furniture, sanitary, fixtures, hatch, dimensions, trees, cars, tiles…; their TEXT is kept) and writes coordinates to 0.01 mm. plot2.dwg: 95,885 → 3,778 entities.
- source.dxf is stored gzip-compressed (~8×); lib/floor-plans/dxf-text.ts dxfTextFromBlob() reads plain or gzip on both browser and server (take-off, run-panels, shell-plan, area-sheet). Old plain uploads still read.

## Revit DWG uploads (TO-01 fix)
- Revit exports carry huge generic/detail/glazing/door/sanitary layers (A-GENM, A-DETL*, A-GLAZ*, A-DOOR*, P-SANR-FIXT, Q-SPCQ…) that hit the 400k entity cap before the unit plans were written. `SKIP_LAYER` now drops them; `SKIP_BLOCK` skips section / elevation / 3D / schedule / legend / detail blocks.
- TO-01: 400k (capped, 50 MB) → 49k entities, 4.6 MB; Block A–D plans present.
- Revit names: A-FLOR / A-FLOR-MCUT → slab, S-STRS* → stairs. Drawing titles may be "BLOCK-A" / "TOWER" / "WING".

## Drawing viewer v2 (parts, names, floors)
- Bug fixed: on load the take-off replaced `t.dxf` and dropped the saved plan region → "whole drawing" was counted. Now merged.
- DWG conversion writes one marker TEXT per named top-level block / Revit view on layer `ACOFORM-VIEWS` ("VIEW|x0|y0|x1|y1|name"); `readDxf` returns them as `model.views` (also big named INSERTs in plain DXF).
- `drawingParts(model, unitToM, roles)` (dxf.ts): splits the file into drawings — 3 m clusters, named views, split by wall plans / by several big titles (1.5 m pieces to nearest title), dedupe, merge broken halves (only where titles sit above drawings), reading order. Each part: title, sub (view name), kind (plan/section/elevation/site/detail/other).
- `viewLabel()` turns Revit names into "TOWER B · 01 FIRST FLOOR PLAN AJ". Plan candidates show view names too.
- Floors: `floorInfoFromTexts(texts, unitToM, extra)` — G+N also from lead / plan name; Revit level-name stacks ("01 FIRST FLOOR LVL … 13 TERRACE FLOOR LVL") give floors (12) and floor height (spacing). "Read drawing again" button re-runs detection (overwrites floors / height / region).
- Viewer: Drawings panel (filter by type, zoom, Count this), Names outlines, Text display, Go to drawing, Zoom box tool, Full screen (Esc), layer eye (screen only) + "Only counted layers", cursor X/Y in m + scale bar.

## Column / beam / staircase modulation + elaborated accessories
- `layoutFloor` now also returns `columns` (ColumnLayout: panels per face A/B, top, clamps), `beams` (BeamLayout per run: side pieces, sides, bottom, props) and `stairs` (StairLayout: soffit across × along, cheeks, landing, props).
- Stairs: take-off Staircase rows → real panels (group "stair": SS soffit, RS riser shutters, CK cheeks, LS landing; 1200 pieces of catalogue width merge into deck panels). Area-only stairs (allowance / lump sum) stay a priced set and get a TYPICAL assumed dog-leg drawing (2 flights, risers ≤170, tread 270, width 1200).
- Beam / stair fillers are now made to the exact length (5 mm), not rounded up to 50.
- Accessories: each row has `sub` (Deck support, Joints, Ties, Wall alignment, Kicker & edges, Columns & beams, Staircase, Safety, Tools & consumables) and `basis` (how counted). New: long pins, PVC sleeves, cones, wing nuts, walers, waler clips, push-pull props + anchors, kicker brackets, column clamps, beam clamps, stair props, riser brackets, platform brackets / planks / guard rails, tool kits, release agent. Catalogue codes are used when present (regex per item), else defaults.
- Modulation PDF: wall sheets + COLUMN (plan + face elevations, clamps), BEAM (types B01… side elevation + section), STAIRCASE (flight elevation, soffit plan, landing) sheets + ACCESSORY SCHEDULE. Panels page and BOM PDF/CSV show sub-groups and "how counted".

## Deck installation drawings + panel numbering (reference: Chinese alu-formwork design software video)
- `lib/floor-plans/zones.ts`: `deckZones` = slab − walls (even-odd of wall rings) − strips over wall gaps (beams over openings) − ducts → zones M1… in reading order; `layoutZone` fills each zone with deck panels in rows of 1200 across the short side, 100 mm mid-beam line between rows, numbers every panel (M12-07), leftover = made-to-size specials; `wallPanelNumbers` numbers wall panels per face (F12-01, …T top, …F filler).
- `panelInputs` returns `zoneWalls` / `zoneGaps` (metres); `runPanels` returns `inp` + `catalog`; `buildZones(inp, catalog)`.
- Route `/floor-plans/[id]/panels/installation` → A3 PDF (key plan, zone sheets with numbers + per-zone list, numbering list); `?format=csv` → numbering list. Buttons on the Panels page.
- Deck BOM still comes from the strip method in `layoutFloor` (not yet from zones).

## Special-panel production drawings + pin-hole check
- `lib/design-engine/fabrication.ts`: ACOFORM STD FAB pattern (from ACOFORM STD FAB (5).dwg): holes Ø16+0.1 at 40 from concrete face on 65 rails; wall height edges 100 then @200, top/bottom edges 50 then @50; deck long edges 50 then @100; beams/corners @50; stiffeners @300 (RULES table); `fabSpec` (holes per edge, ribs, cutting list, kg, warnings), `specialsFromBom` (custom BOM rows with a size), `pinHoleCheck`.
- `lib/pdf/fabrication-document.tsx`: schedule / production order + pin-hole check sheet, then 4 shop drawings per A3 (front view with holes & ribs, hole chains, edge section, cutting list).
- Route `/floor-plans/[id]/panels/fabrication` (PDF, max 120 types) and `?format=csv` (production order + cutting list). Buttons on the Panels page.
- Weights: `PROFILE` sections measured on the ACOFORM STD FAB drawing, Al 6061-T6 (2.70 g/cm³): skin 4 mm 10.8 kg/m², edge rail 65×8 1.153 kg/m, U-stiff 1.203, Y-stiff 1.347, I-stiff 0.602 kg/m. Wall stiffeners U/U/Y at 200, 450, 750 … (2400 W panel 600 wide = 28.2 kg); WT/deck/beam I-stiff @300. `layoutFloor` uses these for every made-to-size piece and any catalogue item without a weight.
- ACOFORM RK panels: clear height = 2400 + 25…175 (25 steps) → one W(RK) panel WRA…WRG (2425…2575) per width instead of a panel + WT.
- Weights calibrated to ACOFORM STD 2400 production weight sheet: catalogue = actual sheet (W 100…600 incl. new 125/225/230, IC 100+100 11.4, EC 65+65 3.7); specials: wall kg = H/2400 × (4.93 + 0.03542 W), others = section weight × 0.915 (ACTUAL in fabrication.ts).
- Supplier sections (6061-T6): U-stiff sec. 8054 0.935 kg/m, Y-stiff NP-406 1.2076 kg/m (447.27 mm²), 230/225 panels = one-piece extrusion NP-193 4.3298 kg/m. Wall pieces use ACTUAL_2400 table (shop weights) scaled by height; others = section weight × 1.01.

## 3D model (three.js 0.169)
- `lib/floor-plans/scene3d.ts` builds the scene (metres): walls = even-odd of zone wall rings extruded to clear height; wall panels as quads on every face (std / top / filler); deck panels from zones at the soffit; mid-beam lines; beams over openings; slab.
- Page `/floor-plans/[id]/panels/3d` (server builds scene, client `viewer.tsx` renders with OrbitControls): layer toggles, 3D / top / front views, click a panel to see its number. Button on the Panels page.

## Design check, stock check, packing list by zone (from the YJK-LMB reference)
- `lib/design-engine/design-check.ts` — `designCheck()` model review + clash check: face fit, wall-panel strips (65 rail + 5 mm, open side found by `faceFrames`) clashing between faces (narrow gaps / crossing corners), wall panels inside concrete, deck panels on walls / across beams over openings / overlapping, uncovered slab per zone, pin-hole check of specials. Issues carry an id (C001…), severity, where (panel / face / zone) and a plan point.
- `lib/floor-plans/check-run.ts` — `checkLayout(r)` = zones + check (used by the check page, CSV and 3D).
- Pages / routes: `panels/check` (summary + list, "See in 3D" → `panels/3d?focus=C012`), `panels/check-list` (CSV), `panels/stock` + `panels/stock-list` (stock first: need vs in-stock QR panels → shortfall to produce), `panels/packing` (CSV, one bundle per zone: its deck panels + wall panels of faces around it; EXT = outer faces).
- 3D model: "Design check" layer with red (error) / amber (warning) balls; click shows the problem.
- `zones.ts layoutZone`: deck panels whose spot is not fully inside the zone (wall / column corner in the row) are left out (become specials); fillers ≤ 25 mm dropped.

## Drawing reading, step 1 (tested on Royce One / Cosmos shell plan and the Guangzhou Motian package)
- `lib/floor-plans/layer-rules.ts` — one place for layer-name rules: `normLayer` ("A_DOOR" = "A-DOOR"), `isNoiseLayer` (doors, windows, glazing, furniture, hatch, dims, Chinese 门/窗/家具/填充/标注 …) used by `dwg-web.ts` (conversion) and `readDxf` (skipped lines still count for the drawing extents so saved regions don't move), `suggestLayerRole` (CCME "- SHELL" layers, template/title/legend/projection/slab-thk ignored, inverted/drop pardi & upstands = beams, Chinese 剪力墙/墙/柱/梁/楼板/洞, 砌块/砖 walls ignored unless 现浇, xref names use the part after "$0$"), `beamSizeFromLayer` ("BEAM 300X750H").
- `drawingParts`: sheet frames side by side (`sheetFrames`) are separate drawings; named blocks holding only skipped layers dropped; long slanting leader lines don't join drawings; Chinese titles (平面图/剖面/立面图/深化图/大样), numbered notes are not titles.
- `dxfAuto`: big / L-shaped "columns" (lift cores, shear walls) are walls; beams sized by layer name or by the label next to them (width must match the drawn strip) → `beamSized` (b, d, clear length, bottom m²) + `beamRings`; framed buildings: slab outline from walls + columns + beams (chajja/railing as edge hints); a slab layer covering < 25 % of the walls' box is ignored. `columnRings` returned.
- `computeTotals`: one beam line per size (2 × clear length × (d − slab)); auto lintels off when beams are drawn with sizes. `panelInputs`: one BeamRun per size, `zoneBeams` (beam + column outlines) cut out of the deck zones (`deckZones(..., solids)`).
- Royce One typical floor (auto roles, no manual setting): slab soffit 1,137 m² vs their 1,115 (+2 %); beam sides 537 vs 394; walls + columns 1,616 vs 1,276 (wall heights under beams / low walls and column casting still to do).

## Step 2 — Panel layout rules (formwork system)
- `lib/design-engine/layout-rules.ts` — `LayoutRules`, three presets (`tierod` 2400 + top panel / Royce One, `flattie` full-height + strip / Motian, `acoform` = old behaviour), `normaliseLayoutRules`, `describeLayoutRules`, `loadLayoutRules` (column `measurement_rules.layout jsonb`, migration `measurement_rules_layout`).
- Settings → "Panel layout rules" (`layout-rules-form.tsx`, `layout-rules-actions.ts`, design approvers): pick a system, then edit widths, heights, strip, corners, kicker, ties, deck widths / lengths, mid beam, prop head, soffit corner length / width, support sets, beam step, columns cast first, loss %.
- Engine (`layoutFloor`, `PanelOptions.rules`): system widths become standard panels (WP-w-h, weight from the standard sections), full-height panels + WS bottom strips, columns cast first to `columnFirstCast` with CT top pieces cast with the slab, IC/EC/kicker/soffit-corner/MB/PH sizes from the rules, flat ties vs tie rods, loss % on pins / ties / sleeves, extra support-head / prop sets.
- Deck: `layoutZone` sizes rows per room from the allowed lengths (`planRows`: fewest rows, then preferred lengths), mid beam width from the rules, deck starts inside the soffit corners (`soffitCornerW`). The deck BOM now comes from the numbered room-by-room layout (`PanelOptions.zoneDeck`), so BOM = installation drawing.
- Columns: only rectangles or real circles are columns; L / T shapes are walls (were read as round forms).
- Royce One, tie-rod system: 1,288 deck panels / 725 m² vs their 1,292 / 731 m². Motian, flat-tie: 2,723 flat ties vs 2,660, 24,622 pins vs 26,070, 813 props (3 sets) vs 921.
- Still open: wall faces under beams / low walls (walls ~ +25–28 % in both test projects), beam sides on sunk slabs.

## Wall area fix (why walls read ~25 % high)
- Measured on both test projects: wall heights under beams were NOT the cause (beams are drawn between walls, not over them). The extra wall area was scope: walls formed with a separate set — the lift / stair core (Motian: central core has no wall panels in their package) and, on Royce One, lift cores / shear walls cast first with the columns.
- New "Separate set" tool on the measuring screen (ShapeKind `separate`, DXF plans): draw round a core; `dxfAuto(..., separate)` leaves its wall rings (`wallSeparate`) and columns out of the typical floor; the area list shows what was left out (`separateWall`). Motian with the core marked: wall panels 689 m² vs their 720 (−4 %).
- Column-layer outlines that are not columns (lift cores, L-shaped shear walls) are flagged edge by edge (`columnWallEdges` → `Face.set = "column"`); with the rule "columns cast first" they become column-set panels to the first pour + CT tops with the slab.
- Doors / windows drawn inside walls (door / window layers, kept apart in `model.dw`): `wallOpeningsOf` finds the stretch of each wall face they cover → faces are cut (pieces over / under the opening, reveals) and the area take-off deducts them (`auto.wallOpenings`).

## Step 3 — design package (Motian-style output)
- Panels page → **Design package (all drawings & lists)** → `/floor-plans/[id]/panels/package`: the 10 package items in Motian order, an "areas" box (floor split into A1…Ak by k-means of the zones) and one ZIP button.
- Excel/CSV lists: `lib/floor-plans/package.ts` + `package-build.ts`, served by `panels/package-files/route.ts?file=main|numbering|production|walers|accessories|packing|check|all&areas=4`.
  - 03 main list by area (area columns + whole floor), 02 numbering, 04 special-panel production order, 05 walers (rows = floor(h / tieV), max 6 m; flat-tie both faces, tie-rod one face), 08 accessories (loss % + support-head sets), 09 packing by zone, 10 design check.
- Assembly plans PDF (A3, 6 sheets): `lib/pdf/assembly-document.tsx`, route `panels/assembly/route.tsx` (wall panels, corners/soffit corners/kickers, beams + type table, deck, mid beams + prop heads, notes).
- Sunk / drop slabs: layers matching sunk|降板|下沉|吊模 → `auto.sunk` → BOM group "drop" (SK-{depth}-1200 + FT-DROP tube).
- FaceLayout now carries `set: "column"`.
- Tested: Royce (tierod) 7 lists + PDF 208 KB; Motian (flattie + core separate) OK; Gorwa regression unchanged (deck 589).
- Not done yet: odd/even floor lists (needs two plans).

## Step 4 — matching real BOMs (Royce One R65)
- Beam sides measured face by face (`dxf.ts`, after the slab outline): inner faces (slab beyond) = depth − slab, outer faces (slab edge / shaft / stair opening) = full depth (BSE-…), parts against walls / columns / crossing beams skipped (5 cm steps). Beams no wider than the wall they sit in, wall-to-wall in the wall line = lintels → wall top panels (T-…, group wall-top). `beamSized[].inner/outer/lintel` (m) → `BeamRun.inner/outer/lintel` (mm).
- New rule `coresWithColumns` (default off): lift cores / L-walls drawn on the column layer are formed with the walls; only true columns are the column set (Royce column sets ≈ 409 m² → app 359–395).
- Soffit corners now run along wall tops + inner beam sides + column faces (one SC line, description gives the lengths).
- Columns also drawn on wall layers / twice are counted once.
- Royce (tie-rod, both lift cores marked "Separate set"): main wall panels 450 vs real 452 m², deck 720 vs 726, wall tops 261 vs 282, panel total 2894 vs 2908. Shallow beams (≤ 225 drop): real BOM forms them with a B100 strip + SCU 100×125 soffit corner — app uses one BS panel (same area).
- Motian / Gorwa regressions unchanged. Motian: unsized G_BEAM lines (564 m) still counted as BL beam sides — check visually before changing.
- 3D model: columns (DXF column layer + drawn columns), every beam on the plan at its own depth, and a dog-leg staircase in each stair box found on stair layers (`zoneCols`, `zoneBeam3`, `zoneStairs` from panel-input → `buildScene3`). Spin 360°, side views, 45° turns, full screen.

## Step 6 — learn from the site
- Table `site_reports` (migration `site_reports`, RLS by tenant; insert needs quotations:create and a plan of the same tenant): floor_label, pour_date, cycle_days, system, lines jsonb (SiteLine: family short / not used, small parts lost), issues jsonb, notes.
- `lib/floor-plans/site-learn.ts`: designLines(bom) (pcs per family + pins / wedges / ties / props / heads), learn(reports) → spare % per family, loss % on small parts, cycle days, issue counts.
- Page `/floor-plans/[id]/site` (button "Site reports" on the Panel layout page): phone-friendly form + list of reports.
- Settings → "Learned from the site": totals for the current system + buttons: use the site loss %, add site spares (rule `sparePct` → BOM rows `SPARE-<most used code>`), remove spares.
- Storage bucket floor-plans now accepts image/vnd.dxf (Mac) etc.; upload form wraps the file with the app's own MIME type.
- Royce One test project: lead ACOFORM/LEAD/26-27/003; drawing = `Royce One - typical floor.dxf` (sheet 1 cut from r5, 355 KB, same results); takeoff prepared (layer roles, 3.65 m / 150 mm, lift cores = separate sets).
- Per-plan formwork system: `takeoff.system` ("tierod" | "flattie" | "acoform", unset = company setting) → `rulesForPlan()` in run-panels (that system's preset values). Selector next to "Formwork system" on the Panel layout page. Royce One test plan = tierod.

## Royce check fixes (general rules, `layout-rules.ts`)
- Lift cores / L-walls on the column layer: outer faces → column set (coresWithColumns, on for tie-rod); faces looking into a shaft / duct opening stay with the walls (`columnWallEdges` in dxf.ts).
- Corners split: internal (IC, `internalCorner × internalCornerLeg`) and external (EC angles only if `wallEcAngles`; never at wall ends ≤ 250 mm). `bothLegs`: corner / soffit-corner area on both legs (Indian BOM practice).
- Soffit corners: SC `soffitCornerW × soffitCornerLeg` along wall tops + column faces; beam caps SCB `× beamCapLeg` along inner beam sides; kicker corners KCE / KIC at slab-edge corners (`kickerCornerLen`). Tie-rod kicker 150.
- New layer role `upstand` (upstand / planter / kerb): outline length × height (from the layer name, else `upstandMm`) → take-off item U + BOM group "upstand" (UP-h-L).
- `columnSetPct` (company rule) and per-plan `takeoff.ruleOverrides.columnSetPct` (Panel layout page: "Column sets bought … %") scale the column-set rows.
- Royce One plan: tie-rod, no separate shapes, UPSTAND layer = upstand, column sets 64 %. Check file: Alu. Formwork/"Royce One - app check vs real files.xlsx" — app 3,573 vs real 3,509 m² (+1.8 %). Open: beam sides +21 %, IC −25 %, column tops above 1st pour (283 m²) not found in the real files, planters not on R5.
