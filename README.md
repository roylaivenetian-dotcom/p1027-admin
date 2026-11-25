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

Hosting target: Firebase project **sick-meal** (`.firebaserc`). Brand in UI: **P1027 Admin**.

```bash
npm run build
npx firebase-tools login          # once per machine (or use FIREBASE_TOKEN from login:ci)
npx firebase-tools use sick-meal
npx firebase-tools deploy --only hosting --project sick-meal
# later: firestore:rules,functions + secrets:set INGEST_API_KEY
```

Headless: `npx firebase-tools deploy --only hosting --project sick-meal --non-interactive --token "$FIREBASE_TOKEN"`.

Writes are **not** done with the web API key — use the feed agent service account.

GitHub (suggested): `roylaivenetian-dotcom/p1027-admin` — create the empty repo, then `git remote add origin … && git push -u origin main`.
