<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CallDesk — Agent Guidelines

## App Summary
CallDesk is a mobile-first personal cold calling CRM built to work lead lists produced by a scraper (leads-magnet).
It enables one-thumb operation on a smartphone to call leads, log activity, and track stats during active calling sessions.
The application is portable, fast, and optimized for high-velocity phone calling workflows.

## Fixed Tech Stack
- **Framework**: Next.js (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database & Auth**: Supabase (Phase 1, not now)
- **Deployment**: Vercel

*Note: Keep the code portable. Do not use Vercel-only runtime packages or edge-only features.*

## Agent Rules & Discipline
1. **Phase Discipline**: Build ONLY the phase you were given. Never work ahead or implement database/auth/screens from later phases until requested.
2. **Data Integrity**: Never invent lead data or seed fake businesses. Any test data used for verification must be explicitly and obviously labelled as test data (e.g., `[TEST_DATA]`).
3. **Security**: Never commit `.env.local`, `.env`, or any Supabase key or API secret to source control.
4. **Database Migrations**: A migration file committed to the repo is NOT a migration applied to the database. After writing any migration, apply it to the live project and prove it by querying the new table/column, before writing code that depends on it.
5. **Schema Verification**: Before writing code that inserts or updates any database table, explicitly verify the exact list of column names and types against the live database schema, not against memory or mental models.
6. **Data Visibility**: Input we do not recognise gets surfaced, never discarded. Silent dropping is how a broken pipeline looks healthy.
