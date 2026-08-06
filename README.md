# CallDesk

CallDesk is a mobile-first personal cold calling CRM built with Next.js App Router, TypeScript, and Tailwind CSS. It is designed to work lead lists produced by a scraper (`leads-magnet`).

## Features (Phase 0)

- Mobile-first shell with safe-area padding for iPhone home indicator.
- 4 bottom navigation tabs: **Today**, **Leads**, **Import**, **Stats**.
- Minimum 44px tap targets and 16px font sizing to prevent iOS input auto-zoom.
- Portable, clean architecture ready for Vercel deployment.

## Prerequisites

- Node.js 18.x or later
- npm / pnpm / yarn

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser (use mobile viewport mode, e.g. 375px width).

## Production Build & Verification

To verify the production build locally:

```bash
npm run build
npm run start
```

## Deployment

### Vercel Deployment

1. Push your repository to GitHub / GitLab / Bitbucket.
2. Import the repository into your Vercel Dashboard.
3. Keep default settings (Framework Preset: Next.js).
4. Deploy!

Alternatively, deploy directly using Vercel CLI:
```bash
npx vercel
```
