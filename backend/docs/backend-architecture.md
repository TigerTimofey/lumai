# Backend Architecture Overview

## Tech Stack
- **Runtime:** Node.js 20.x (TypeScript)
- **Framework:** Express.js (modular routers/services)
- **Auth & Identity:** Firebase Authentication (email/password, Google, GitHub + optional TOTP MFA)
- **Database:** Cloud Firestore (Native mode)
- **Validation:** Zod (schema validation & normalization helpers)
- **Logging:** pino + pino-http (structured logs)
- **HTTP Clients:** axios (Identity Toolkit, Secure Token APIs)
- **MFA:** TOTP secrets generated with `speakeasy`

> 📌 Cloud Storage integration is intentionally deferred. Export-related modules remain stubbed until a storage solution is provisioned in later roadmap stages.

## Module Layout
```
backend/
├─ src/
│  ├─ app.ts                     # Express bootstrap & middleware
│  ├─ server.ts                  # Runtime entrypoint
│  ├─ config/
│  │  ├─ env.ts                  # Env parsing & validation
│  │  └─ firebase.ts             # Firebase Admin initialization
│  ├─ middleware/
│  │  ├─ auth-context.ts         # ID token verification, loads user context
│  │  └─ error-handler.ts        # Unified error responses
│  ├─ routes/
│  │  ├─ index.ts                # API router composition
│  │  ├─ auth.routes.ts          # Registration/login/OAuth/MFA/password-reset flows
│  │  ├─ profile.routes.ts       # Profile CRUD, history, versions
│  │  ├─ privacy.routes.ts       # Privacy preferences & consents
│  │  ├─ ai.routes.ts            # AI prep + insight listings
│  │  └─ export.routes.ts        # Export endpoint (returns 503 until enabled)
│  ├─ services/
│  │  ├─ auth.service.ts         # Firebase Auth + token workflows + TOTP MFA
│  │  ├─ profile.service.ts      # Normalization, versioning, CRUD orchestration
│  │  ├─ consent.service.ts      # Consent/notification management
│  │  ├─ ai.service.ts           # Anonymized payload preparation & logging
│  │  └─ export.service.ts       # Export stub (deferred storage integration)
│  ├─ repositories/
│  │  ├─ user.repo.ts            # Firestore adapters for users + MFA metadata
│  │  ├─ profile.repo.ts         # Health profile documents & versions
│  │  ├─ consent.repo.ts         # Consent records + audit trail
│  │  ├─ processed-metrics.repo.ts # Processed metrics snapshots
│  │  └─ ai-insight.repo.ts      # AI insight logging utilities
│  ├─ domain/
│  │  ├─ enums.ts                # Enumerations & vocabularies
│  │  ├─ types.ts                # Firestore domain types
│  │  ├─ validation.ts           # Health profile schemas + normalization
│  │  └─ auth.validation.ts      # Auth/Zod schemas (register/login/OAuth/MFA)
│  ├─ utils/
│  │  ├─ api-error.ts            # API error helpers
│  │  └─ logger.ts               # pino logger instance
│  └─ types/express.d.ts         # Express request augmentation
├─ tests/                        # Vitest suites (future)
├─ docs/                         # Architecture & design notes
├─ package.json
├─ tsconfig.json
├─ README.md
└─ .env.example
```

## Environment Variables
| Variable | Description |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project identifier |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON (Auth/Firestore) |
| `WEB_API_KEY` | Firebase Web API key (used for Identity Toolkit sign-in/refresh) |
| `ANONYMIZATION_SALT` | Secret salt for hashing user identifiers in processed AI payloads |
| `FRONTEND_URL` | Public URL used as callback for Firebase OAuth flows (local dev: `http://localhost:5173`) |
| `AI_RATE_LIMIT_MAX` | Optional per-user AI request burst limit (default 5 per minute) |
| `AI_RATE_LIMIT_WINDOW_MS` | Optional rate-limit window in milliseconds (default 60 000) |
| `PORT` | Express HTTP port (defaults to 4000) |

> ⚠️ Create a Firebase service account with roles: **Firebase Admin** and **Cloud Datastore User**. Cloud Storage permissions can be granted later when export functionality is re-enabled.

## Firestore Data Model (Auth additions)
- `users/{uid}` now stores `mfa` metadata: `{ enabled, secret?, otpauthUrl?, enrolledAt? }`
- MFA secrets are stored base32 encoded; disable flow clears secrets via `FieldValue.delete()`

## Security & Encryption Story

### Data classification
- **Tier 0 (identity/PII):** Auth records managed by Firebase Authentication; mirrored profile data lives under `users/{uid}`.
- **Tier 1 (health metrics & consents):** Documents stored in Firestore collections `profiles`, `processedMetrics`, `consents`, and `aiInsights`.
- **Tier 2 (diagnostics):** Structured logs emitted via `pino` and streamed to Cloud Logging with request identifiers only.

### Encryption in transit
- All client ↔ backend calls terminate on HTTPS (Cloud Run/HTTPS load balancer). Express behind `trust proxy` enforces TLS-only origins.
- Backend ↔ Firebase Admin SDK uses gRPC/HTTPS with Google-managed TLS certificates.
- Service-to-service callbacks (e.g., AI providers) are invoked over HTTPS with mutual authentication tokens.

### Encryption at rest
- Firestore, Firebase Authentication, and Cloud Logging are encrypted at rest with Google-managed keys (AES-256). This covers Tier 0–2 data by default.
- **Field anonymisation:** `ANONYMIZATION_SALT` (env var) seeds SHA-256 hashing for user identifiers before insights/processed metrics are stored; keeps AI payloads pseudonymised.

### Field-level encryption (application-managed)
- **Scope:** Highly sensitive health attributes (future blood markers, lab results) must be symmetrically encrypted before writes.
- **Cipher:** AES-256-GCM using Node's `crypto` module. Plaintext is padded & encoded; auth tag stored alongside ciphertext.
- **Envelope key:** `FIELD_ENCRYPTION_KEY` (32-byte base64) retrieved at boot from Secret Manager (local dev reads `.env`). Key never logged, and held only in memory after boot.
- **Helpers:** `encryptField(value, context)`/`decryptField(value, context)` utilities to be added under `src/utils/crypto.ts`. Repositories must wrap writes/reads for protected fields.
- **Key rotation:** Maintain `FIELD_ENCRYPTION_KEY_VERSION`. Rotation procedure:
  1. Provision new key in Secret Manager.
  2. Deploy with both old & new keys; decrypt with old, re-encrypt with new during incremental migration script.
  3. Mark old key as retired, remove after verification.

### Secret management
- Environment secrets (`FIREBASE_SERVICE_ACCOUNT_KEY`, `ANONYMIZATION_SALT`, `FIELD_ENCRYPTION_KEY`) are sourced from Google Secret Manager in production. Local dev uses `.env` with limited scopes.
- CI/CD pipeline pulls secrets via workload identity; no secrets committed to git.

### Audit & monitoring
- **Access logging:** Cloud Audit Logs enabled for Firestore, Secret Manager, Cloud Run. Retention: 400 days.
- **Tamper checks:** Weekly automated job exports `consents` and `processedMetrics` hashes to Cloud Storage for integrity comparison.
- **Incident response:** runbook outlines containment steps (revoke keys, rotate salts, notify DPO within 72h).
- **Evidence pack:** Maintain `/backend/docs/audit-checklist.md` (see TODO) with quarterly verification of key rotation, salt review, and penetration-test results.
- **Availability controls:** AI-facing endpoints gated by per-user in-memory throttling (default 5 req/60s) and emit structured errors when upstream models time out or reject requests.

### Open items / TODOs
- Implement `crypto` helpers + repository wrappers for Tier 1 fields when encryption flag is toggled.
- Wire Secret Manager integration for `FIELD_ENCRYPTION_KEY` and document local bootstrap script.
- Draft `audit-checklist.md` and populate with verification steps + sign-off table.

## Authentication Workflow
1. **Registration** → Firebase Admin creates user, backend seeds `users` + `consents`, returns verification link + tokens
2. **Login (email/password)** → Identity Toolkit `signInWithPassword` + optional TOTP validation when MFA enabled
3. **OAuth (Google/GitHub)** → Identity Toolkit `signInWithIdp` endpoint; backend updates email verification flag and enforces MFA if enabled
4. **Refresh** → `/api/auth/refresh` wraps Secure Token API to exchange refresh tokens
5. **Email flows** → `/api/auth/send-verification` & `/api/auth/password-reset` create ready-to-send links (delivery handled client-side/SMTP later)
6. **MFA** → `/api/auth/mfa/enroll` issues TOTP secret; `/api/auth/mfa/activate` verifies code and enables; `/api/auth/mfa/disable` clears secret

## Outstanding Tasks
- Implement actual email delivery + UI for verification/reset links
- Surface MFA status on frontend and support backup codes if required
- Implement Storage-backed export pipeline when storage is available
- Add automated tests and tighten rate-limiting / abuse prevention on auth endpoints
