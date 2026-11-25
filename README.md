# Food & Leave workplace app

Vite + React + TypeScript UI for **P1027 Admin** lunch summaries and leave, targeting Firebase **`sick-meal`**.

Companion writer: Agent SDK bot **`whatsapp-food-feed`** (`/agent/whatsapp-food-feed`) — Admin SDK writes to Firestore. Shared contract: `/cursor/stores/self/docs/food-leave-app.md`.

## Quick start

```bash
cd /agent/food-leave-app
cp .env.example .env.local   # fill VITE_FIREBASE_* (never commit secrets)
npm install
npm run dev                  # http://127.0.0.1:5173
```

Prefers live `orders` / `leaveRequests`; falls back to local mock with the **same document shape**.

## Collections (read)

| Collection | Role |
|------------|------|
| `orders` | Daily lunch lines from WhatsApp |
| `leaveRequests` | Leave applications |
| `weeklyReports` | Friday rollups |
| `people` / `menuItems` | Optional directory + pricing menu |

## Pricing

Meal **HK$50**, soup **free**, drink **+HK$5**. `onMenu: false` → `amount: 0`, remark `未計價`, excluded from totals.

## Friday report

- Bot schedule: Friday **17:00 HKT** (`0 9 * * 5` UTC) — see bot `friday-food-summary`
- Optional Cloud Function mirror: `fridayFoodReport` (`0 17 * * 5` Asia/Hong_Kong)

## Deploy

```bash
npm run build
firebase use sick-meal
firebase deploy --only hosting,firestore:rules,functions
firebase functions:secrets:set INGEST_API_KEY   # optional HTTP bridge
```

Writes are **not** done with the web API key — use the feed agent service account.
