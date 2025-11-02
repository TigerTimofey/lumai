# Lumai Wellness Platform

Lumai is a wellness companion that combines a React/Vite frontend with an Express/Firebase backend. It helps users track health metrics, consent preferences, secure sessions, and receive AI-generated coaching insights.

The repository is split into two workspaces:

- `frontend/lumai` – Vite + React client
- `backend` – Node.js/Express API with Firebase Admin SDK

This README gives you everything you need to configure Firebase, run both services locally, and understand the key tooling that powers the project.

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

## 7. Testing & Manual Verification

Automated tests are minimal today, so rely on manual verification:

1. Register/login, include MFA if desired.
2. Fill in profile data and verify that analytics charts update.
3. Call `/api/ai/insights` to ensure AI fallback logic and priority tags work.
4. Exercise `/api/privacy` endpoints to confirm consent changes reflect in the UI.
5. Hit `/api/export` (POST) and expect a 503 placeholder until Cloud Storage is wired up.

For more backend details (API catalog, AI limitation handling) see `backend/README.md`. Frontend component documentation lives alongside each feature folder.

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
