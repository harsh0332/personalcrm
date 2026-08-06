# CallDesk — Claude Guidelines

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

## Execution & Verification Protocol
1. **Verification**: Every task ends with a verification step whose raw output is shown to the user.
2. **Test Reporting**: Test reports must state total count AND pass count (e.g. `Total: X, Passed: Y, Failed: Z`). Never use vague terms like "all green".
3. **Ambiguity Protocol**: If a requirement is ambiguous, stop and ask the user rather than choosing or assuming.
