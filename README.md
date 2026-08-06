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

## Features & Progress

- **Phase 0**: Scaffolding, 4-tab mobile shell, dark theme.
- **Phase 1**: Database schema (`leads`, `activities`, `followups`, `imports`, `dispositions`), RLS policies, unique `(owner, cid)` deduplication, and single-user magic link auth allowlist.

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

To create a new migration:
```bash
npx supabase migration new <migration_name>
```

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
