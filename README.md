# CallDesk

CallDesk is a mobile-first personal cold calling CRM built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase.

## Environment Setup

Create a `.env.local` file in the project root with the following keys (never commit this file):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Authentication Allowlist (Single-user restriction)
ALLOWED_EMAIL=your-email@example.com
```

## Database Restoration Procedure (From Full Backup CSVs)

If your Supabase database is paused, deleted, or lost, you can fully restore your complete call history using the CSV files downloaded via **Export Everything** on the Account screen:

1. **Prerequisite**: Initialize the database schema by executing the SQL migrations in `supabase/migrations/` (or running `npx supabase db push`).
2. **Restore Leads (`calldesk_backup_leads_YYYY-MM-DD.csv`)**:
   - Go to `/import` in the CallDesk app or use Supabase Table Editor.
   - Upload `calldesk_backup_leads_YYYY-MM-DD.csv`.
   - The app will restore all 169+ leads with their original CIDs, tiers, campaign assignments (`Indore Dentists`), ratings, and review counts.
3. **Restore Call Activity History & Outcomes (`calldesk_backup_activities_YYYY-MM-DD.csv`)**:
   - Open Supabase SQL Editor / Table Editor for `activities` table.
   - Import `calldesk_backup_activities_YYYY-MM-DD.csv` into `public.activities`.
   - All call logs (disposition codes, call durations, notes, timestamps, and caller IDs) are restored 100%.
4. **Restore Follow-up Commitments (`calldesk_backup_followups_YYYY-MM-DD.csv`)**:
   - Import `calldesk_backup_followups_YYYY-MM-DD.csv` into `public.followups`.
   - All scheduled follow-up dates and reasons are restored.

> **Note**: Both the Outcomes CSV and Full Backup CSVs include a **UTF-8 Byte Order Mark (`\uFEFF`)** so Devanagari/Hindi business names (e.g. `दृष्टि डेंटल क्लिनिक`) open cleanly in Microsoft Excel on Mac and Windows without text garbling.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Migrations

Database migrations are managed via Supabase CLI and committed in `supabase/migrations/`.

## Production Build & Verification

```bash
npm run build
npm run start
```

## Deployment

Deploy to Vercel:
```bash
vercel --prod
```
Ensure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `ALLOWED_EMAIL` environment variables are added in your Vercel Project Settings.
