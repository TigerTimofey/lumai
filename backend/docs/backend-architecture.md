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
| `PORT` | Express HTTP port (defaults to 4000) |

> ⚠️ Create a Firebase service account with roles: **Firebase Admin** and **Cloud Datastore User**. Cloud Storage permissions can be granted later when export functionality is re-enabled.

## Firestore Data Model (Auth additions)
- `users/{uid}` now stores `mfa` metadata: `{ enabled, secret?, otpauthUrl?, enrolledAt? }`
- MFA secrets are stored base32 encoded; disable flow clears secrets via `FieldValue.delete()`

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
