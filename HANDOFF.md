# ACOFORM ONE – handoff notes (for the next Claude session)

**Status (28 Sep 2026):** app rebuilt from scratch (the original code was lost with the Windows PC).
All code is committed in this repo's git history. Database changes 00024–00032 are ALREADY applied
to the live Supabase project `hxlkinnosgckehogtpgb` (do not re-apply).

## First job in the new session
1. `git push -u origin main` to `acoform2025-afk/acoform-one` (repo was empty).
2. Push the same commit to a `test` branch too → GitHub Action builds and deploys to the
   Hugging Face Space `acodorm/acoform-one-test` (and `main` → `acodorm/acoform-one`).
   Needs repo secret `HF_TOKEN` (user added it on 28 Sep).
3. Watch the Action, open the Space, check /api/health and the login page, send the user the link.
4. Spaces are created private. Later: Cloudflare Zero Trust + Worker proxy like erp.acodor.com.

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
