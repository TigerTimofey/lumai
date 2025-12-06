# DevOps & Extras

## 1. Environment configuration
Backend variables are described in `backend/.env.example`.

- `FIREBASE_SERVICE_ACCOUNT_KEY` — Base64 JSON service account.
- `FRONTEND_URL` — public SPA URL (default `http://localhost:4173`).
- `VECTOR_DB_URL` / `VECTOR_DB_COLLECTION` — Qdrant/pgvector endpoint.
- `VITE_BACKEND_URL` — backend origin for the SPA.

Copy `.env.example` to `.env` and fill in real values before deploying.

## 2. Docker & Compose

```
FIREBASE_SERVICE_ACCOUNT_KEY=$(cat service-account.json | base64) docker-compose up --build
```

Services:
- `vector-db` — Qdrant (ports 6333/6334), data volume `./data/vector`.
- `backend` — Node/Express API (port 4000), connects to Firebase + vector DB.
- `frontend` — Vite build served by nginx (port 4173).

Logs: `docker-compose logs -f <service>`.

## 3. Prompt pipeline
`src/services/meal-planning-orchestrator.service.ts`
1. `strategy` — profile analysis, macro focus.
2. `structure` — meal times vs timezone/start date.
3. `recipes` — maps meals to RAG outputs.
4. `analytics` — highlights/risks/suggestions for the UI.
Each step is logged via `logAiInsight` in `ai_insight_logs`.

## 4. Data & embeddings pipeline
`scripts/nutrition/ingest.ts`
- reads CSV data, computes macro/micro totals
- writes recipes + ingredients to Firestore
- generates embeddings and pushes them to Firestore + Qdrant

## 5. Testing
```
cd backend
npm run test
npm run lint
```
- `src/utils/__tests__/recipe-filters.test.ts` validates health-aware recipe filters.
- Integration scenarios use Vitest + manual e2e runs (`npm run ingest:nutrition`, `npm run dev`).

## 6. Community rating & moderation
Endpoints:
- `POST /api/nutrition/recipes/:id/reviews` — create review (`pending`).
- `GET /api/nutrition/recipes/:id/reviews?status=pending` — filter by status.
- `PATCH /api/nutrition/recipes/:id/reviews/:reviewId/moderate` — approve/reject; recipe rating is recalculated only from approved reviews.

## 7. Micronutrient analytics
Backend: `GET /api/nutrition/micronutrients/summary` aggregates latest snapshot, highlights deficits, and suggests recipes.
Frontend: "Micronutrient focus" card + regeneration filter.

## 8. Conversational assistant
- `GET /api/assistant/conversation` – returns the stored chat history + context summary per user.
- `POST /api/assistant/chat` – routes user prompts through the system prompt while enabling function-calling so the model can fetch real Firestore data (health metrics, meal plans, recipes, visualizations, etc.). Tool responses always contain live values—no fabrication is allowed.
- Conversation state is persisted in `assistant_conversations` with automatic summarisation when the history grows, keeping token usage in check.
