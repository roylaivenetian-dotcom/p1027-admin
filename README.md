# Food & Leave workplace app

Vite + React + TypeScript web app for **lunch order summaries** and **leave applications**, targeting Firebase project `roy-console`.

Companion bot (sibling): **whatsapp-food-feed** (Agent SDK) writes WhatsApp-parsed orders into the same Firestore schema.

## Quick start

```bash
cd /agent/food-leave-app
cp .env.example .env.local   # then fill VITE_FIREBASE_* (see internal config; do not commit secrets)
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

Without Firestore data (or if rules block reads), the UI uses **local mock** orders that match the same document shape.

## Environment

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `roy-console.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `roy-console` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender id |
| `VITE_FIREBASE_APP_ID` | Web app id |
| `INGEST_API_KEY` (Functions secret) | Shared secret for bot HTTP ingest |

`.env.local` is gitignored. `.env.example` has empty placeholders only.

## Firebase deploy

```bash
npm run build
# firebase login && firebase use roy-console
firebase deploy --only hosting,firestore:rules,functions
```

Set the Functions secret before deploy:

```bash
firebase functions:secrets:set INGEST_API_KEY
```

## Friday report (17:00 HKT)

Cloud Function `fridayFoodReport` is scheduled with:

- Cron: `0 17 * * 5`
- Time zone: `Asia/Hong_Kong`

It reads `orders` for the current Mon–Fri week, aggregates priced totals (skips `未計價` / `unpriced`), and writes `weeklyReports/{weekStart}`.

Until Functions are deployed, you can treat the Food summary tab + “Simulate WhatsApp order push” as the client-side preview.

## Bot feed

See project doc: Bot feed contract in the store doc `food-leave-app.md` (collections, document ids, HTTP API). The bot should either:

1. **Preferred:** `POST` Hosting rewrite `/api` → Function `api` with `x-ingest-key`, or  
2. Write Firestore directly with **Admin SDK** using the same document shapes/ids.

## Pricing

- Meal on fixed menu → **HK$50**
- Soup → **free**
- Drink → **+HK$5**
- Not on menu → remark only, **未計價**, excluded from person totals
- Provisional lines show **暫計**

## Leave

Self-serve records (`leaveRequests`) with person, dates, type, note. UI emphasizes the **1st of each month** (Asia/Hong_Kong). Approval workflow TBD.
