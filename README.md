# Lumai Wellness Platform

Lumai is a wellness companion that combines a React/Vite frontend with an Express/Firebase backend. It helps users track health metrics, consent preferences, secure sessions, and receive AI-generated coaching insights.

The repository is split into two workspaces:

- `frontend/lumai` – Vite + React client
- `backend` – Node.js/Express API with Firebase Admin SDK

## Quick Docker Start

1. From the repo root run:
   ```bash
   docker-compose up --build
   ```
2. Once the containers finish booting, open the frontend at **http://localhost:4173** (the backend listens on http://localhost:4000).


This README gives you everything you need to configure Firebase, run both services locally, and understand the key tooling that powers the project.

---

## Wellness Frontend Usage

Below you will find usage instructions for the React/Vite SPA frontend.

#### Prerequisites
- Node.js 20+
- npm
- Running backend (`http://localhost:4000` by default)

#### Local development
```bash
cd frontend/lumai
npm install
VITE_BACKEND_URL=http://localhost:4000 npm run dev
```

#### Production build
```bash
npm run build
npm run preview
```

#### Docker
The root project contains `frontend/Dockerfile` and `docker-compose.yml`.
Build & run with the backend and vector DB:
```bash
docker-compose up --build
```
Frontend will be available on `http://localhost:4173`.

---

## Community-driven RAG

- Every recipe modal includes a “Help improve recipes” form. When users submit feedback (like/dislike/issues/suggestions), it’s stored in Firestore (`recipe_feedback`) so we can triage hallucinations and expand the RAG dataset.
- Preference history is persisted automatically (see plan history card) so meal plans can reference prior calorie/diet changes when generating future recommendations.

---

## 1. Prerequisites

- **Node.js 20+** (use `nvm` or the official installer)
- **npm 10+** (bundled with Node 20)
- **Firebase project** with:
  - Firestore (in Native mode)
  - Authentication providers you plan to support (Email/Password, Google, GitHub)
  - Service account credentials with access to Auth + Firestore
- Optional: HuggingFace or OpenAI key if you intend to use real AI providers (the code works with stubs by default)

---

## 2. Firebase Setup

1. Create a Firebase project (https://console.firebase.google.com/).
2. Enable **Firestore** and set security rules appropriate for your environment.
3. Enable **Authentication** providers (Email/Password plus any OAuth providers you want to offer).
4. Generate a **service account JSON** (Firebase Admin SDK role) and base64-encode it:

   ```bash
   cat path/to/service-account.json | base64
   ```

5. Copy the Firebase web config from **Project Settings → General → Your Apps**. You’ll need the `apiKey`, `authDomain`, `projectId`, etc. for the frontend.

---

## 3. Backend Configuration

The backend loads environment variables from `backend/.env`. A sample file is provided at `backend/.env.example`.

```bash
cd backend
cp .env.example .env
```

Update the values:

- `FIREBASE_PROJECT_ID` – your Firebase project ID
- `FIREBASE_SERVICE_ACCOUNT_KEY` – base64 string from step 4 above
- `WEB_API_KEY` – Firebase Web API key
- `FRONTEND_URL` – e.g. `http://localhost:5173`
- Optional limits: `AI_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`

Install dependencies and run the server:

```bash
cd backend
npm install
npm run dev        # starts Express with hot reload (tsx)
# npm run build && npm start (for production)
```

By default the backend listens on **http://localhost:4000** and exposes routes under `/api/*`.

---

## 4. Frontend Configuration

The frontend expects Vite-style environment variables. Copy `.env.example` to `.env` inside `frontend/lumai`:

```bash
cd frontend/lumai
cp .env.example .env
```

Set the Firebase web config and backend URL:

```ini
VITE_FIREBASE_API_KEY=<Firebase apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<Firebase authDomain>
VITE_FIREBASE_PROJECT_ID=<Firebase projectId>
VITE_FIREBASE_STORAGE_BUCKET=<optional>
VITE_FIREBASE_MESSAGING_SENDER_ID=<optional>
VITE_FIREBASE_APP_ID=<appId>
VITE_BACKEND_URL=http://localhost:4000
VITE_SESSION_IDLE_MINUTES=30
```

Install dependencies and run the dev server:

```bash
cd frontend/lumai
npm install
npm run dev        # starts Vite on http://localhost:5173
```

The frontend automatically proxies API calls to the URL provided in `VITE_BACKEND_URL`.

---

## 5. Running Everything Together

In two terminals:

```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend/lumai
npm run dev
```

Open http://localhost:5173 in your browser. Authentication, dashboards, analytics, and AI features all communicate with the Express API running at http://localhost:4000.

---

## 6. Key Features

- **Secure Auth & MFA** – Firebase Auth integration with 2FA lifecycle endpoints
- **Privacy & Consent** – `/api/privacy` routes manage data usage, marketing, and AI consents
- **Health Profiles** – Normalised metric storage with historical versioning
- **AI Insights** – Processed metrics + AI service that generates coaching summaries (with priority and validation)
- **Dashboard Widgets** – React components for health summaries, AI insights, workout logging, consent modals, etc.
- **Rate Limiting** – Both AI-specific and global API throttling to prevent rapid-fire abuse
- **Error Feedback** – Frontend toast listener shows API errors instantly

---

## 6.1 Frontend Experience Checklist

- [x] **5.1 Dashboard enhancements** – Calorie/macro progress bars, micronutrient radar, highlight cards, and AI advice blocks surface live data from `/nutrition/preferences`, `/nutrition/snapshots`, and the latest meal-plan analysis.
- [x] **5.2 Meal planner UI** – Preferences form, weekly calendar view, meal cards with swap/regeneration/manual-add controls, and a recipe modal (steps, nutrients, substitutions, portion scaling) built atop `/nutrition/meal-plans`.
- [x] **5.3 Shopping list UI** – Category grouping, quantity inputs, and removal toggles synced with `/nutrition/shopping-lists`.
- [x] **5.4 Historical analytics** – Daily deficit/surplus, macro/micro comparisons, and trend lines rendered from `/nutrition/snapshots`.
- [x] **5.5 Timezone & ISO-8601 support** – Planner and snapshots respect the user’s timezone while storing ISO timestamps; SessionContext resets timers when nutrition routes are hit.
- [x] **5.6 Design system alignment** – All new components reuse dashboard shells, button styles, typography, and spacing conventions for a consistent look.

> When a weekly plan is generated, the `/nutrition` calendar immediately renders each day’s meals (with times, macros, and actions). Users can edit the generated plan via swap/regenerate/manual-add, so the AI-produced baseline is always readable and modifiable.

---

## 7. Testing & Manual Verification

Automated tests are minimal today, so rely on manual verification:

1. Register/login, include MFA if desired.
2. Fill in profile data and verify that analytics charts update.
3. Call `/api/ai/insights` to ensure AI fallback logic and priority tags work.
4. Exercise `/api/privacy` endpoints to confirm consent changes reflect in the UI.
5. Hit `/api/export` (POST) and expect a 503 placeholder until Cloud Storage is wired up.

For more backend details (API catalog, AI limitation handling) see `backend/README.md`. Frontend component documentation lives alongside each feature folder.

---

## 8. AI & Data Reference

### Prompt engineering strategy
- The meal-planning orchestrator runs four chained prompts—**strategy → structure → recipes → analytics**—defined in `backend/src/services/{ai,meal-planning-orchestrator}.service.ts`. Each prompt template enforces JSON output keys, keeps temperatures/`top_p` per step predictable, and replays a small set of few-shot examples so we always get machine-readable responses.
- Retrieval-augmented context is assembled from the recipe vector index (`nutrition-rag.service.ts`). Up to 12 high-similarity recipes are injected into the recipe step, while the analytics step receives a compact `planSummary`. Tool/function calling routes nutrition lookups through `calculate_nutrition`, guaranteeing that macros/micros come from our canonical database instead of hallucinated values.
- User profiles are down-scoped to only the necessary demographics, lifestyle, and targets. Before any prompt is issued, the workflow verifies that the `ai_insights` consent flag is granted and stores a hashed `privacyHash` so that any logged prompt context stays pseudonymized.

### AI model selection rationale
- The AI layer is fronted by Hugging Face Inference (`HF_API_URL`/`HF_API_KEY`) with `meta-llama/Meta-Llama-3-8B-Instruct` as the default `HF_MODEL`. This model balances accuracy and cost, supports JSON-style responses plus function calling, and can be self-hosted later if we need to move off shared infrastructure.
- Operators can swap in another Hugging Face or OpenAI-compatible chat model by changing env vars without touching code. Insight generation persists model names per record so we can A/B providers, measure drift, and roll back quickly if a regression is detected.
- Health summaries and streak insights still have deterministic fallbacks (`health-summary.service.ts`), so even if an external model is unreachable the UI can continue to show meaningful, rule-based copy.

### Data model decisions
- Firestore stores tiered collections: `users` for auth + MFA metadata, `profiles` for longitudinal health records (versioned via `profileVersionId`), `processedMetrics` for anonymized AI snapshots, `consents` for privacy toggles, and `aiInsights` for auditability of generated content. Nutrition features add `recipes_master`, `nutrition_preferences`, `meal_plans`, `shopping_lists`, and review subcollections so that AI output can always be traced back to structured data.
- Processed metrics are stamped with a 90-day TTL and a SHA-256 hash of `ANONYMIZATION_SALT:userId`, letting us join AI payloads back to a user when investigating an issue while still keeping exports pseudonymous.
- Vector search is optional: when `VECTOR_DB_URL` is present we query the external store, otherwise we fall back to Firestore-stored embeddings and even bundled recipes for offline/local dev. This keeps developer onboarding simple without sacrificing accuracy in production.

### Error handling methods
- All business logic throws typed helpers from `backend/src/utils/api-error.ts`, and the global `errorHandler` middleware maps them to consistent JSON responses while logging through `pino`. Frontend API calls listen for these errors and surface them via toast notifications so users immediately see validation or permission issues.
- Request throttling is layered: `apiRateLimit` protects every route, while `aiRateLimit` adds a stricter per-user bucket for AI endpoints. When limits trigger we send 429 responses with retry-after hints so the UI can back off gracefully.
- AI-specific failures try to reuse the last successful `aiInsights` document (see `tryReturnCachedInsights`). Providers returning 401/429/5xx errors fall back to cached content with a banner note, keeping the UX resilient even when upstream models are flaky.

---

## 8. Useful npm Scripts

### Backend
- `npm run dev` – ts-node/tsx development server
- `npm run build` – transpile to `dist`
- `npm start` – run compiled JS

### Frontend
- `npm run dev` – Vite dev server
- `npm run build` – production build (`dist/`)
- `npm run preview` – preview production build locally

---

## 9. Deployment Notes

- Configure environment variables for both backend and frontend builds (Firebase keys, rate limits, AI provider keys).
- Set up hosting for the frontend (e.g., Firebase Hosting, Vercel) and point it to the built `dist` output.
- Deploy the backend to a Node-friendly environment (Cloud Run, Render, Heroku, etc.) with the same env vars used in development.

---

## 10. Troubleshooting

- **401 / 403 errors** – ensure Firebase ID tokens are passed via `Authorization: Bearer <token>` and the user has the required consents.
- **429 Too Many Requests** – adjust `AI_RATE_LIMIT_*` or `API_RATE_LIMIT_*` env values when testing.
- **503 from `/api/export`** – expected until Cloud Storage integration is completed.
- **AI provider errors** – misconfigured HuggingFace/OpenAI keys will cause fallbacks or cached results; check backend logs for details.

Have fun building with Lumai! Contributions and issue reports are welcome.
