# Backend Architecture Overview

## Tech Stack
- **Runtime:** Node.js 20.x (TypeScript)
- **Framework:** Express.js (modular routers/services)
- **Auth & Identity:** Firebase Authentication (email/password + Google & Apple OAuth)
- **Database:** Cloud Firestore (Native mode)
- **Storage:** Cloud Storage (profile exports & AI payload artifacts)
- **Validation:** Zod (schema validation & normalization helpers)
- **Logging:** pino + pino-http (structured logs)
- **HTTP Clients:** axios (Identity Toolkit & Secure Token APIs)

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
│  │  ├─ auth.routes.ts          # Registration/login/refresh endpoints
│  │  ├─ profile.routes.ts       # Profile CRUD, history, versions
│  │  ├─ privacy.routes.ts       # Privacy preferences & consents
│  │  ├─ ai.routes.ts            # AI prep + insight listings
│  │  └─ export.routes.ts        # Profile export requests
│  ├─ services/
│  │  ├─ auth.service.ts         # Firebase Auth + token workflows
│  │  ├─ profile.service.ts      # Normalization, versioning, CRUD orchestration
│  │  ├─ consent.service.ts      # Consent/notification management
│  │  ├─ ai.service.ts           # Anonymized payload preparation & logging
│  │  └─ export.service.ts       # Export assembly & signed URL generation
│  ├─ repositories/
│  │  ├─ user.repo.ts            # Firestore adapters for users
│  │  ├─ profile.repo.ts         # Health profile documents & versions
│  │  ├─ consent.repo.ts         # Consent records + audit trail
│  │  ├─ processed-metrics.repo.ts # Processed metrics snapshots
│  │  └─ ai-insight.repo.ts      # AI insight logging utilities
│  ├─ domain/
│  │  ├─ enums.ts                # Enumerations & vocabularies
│  │  ├─ types.ts                # Firestore domain types
│  │  └─ validation.ts           # Zod schemas + normalization
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
| `FIREBASE_STORAGE_BUCKET` | Optional custom storage bucket (defaults to `<projectId>.appspot.com`) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON (Auth/Firestore/Storage) |
| `WEB_API_KEY` | Firebase Web API key (used for Identity Toolkit password sign-in & refresh) |
| `ANONYMIZATION_SALT` | Secret salt for hashing user identifiers in processed AI payloads |
| `PORT` | Express HTTP port (defaults to 4000) |

> ⚠️ Create a Firebase service account with roles: **Firebase Admin**, **Cloud Datastore User**, **Cloud Storage Admin**. Encode the JSON as base64 before placing it in `FIREBASE_SERVICE_ACCOUNT_KEY`.

## Firestore Data Model

### `users/{uid}`
- `email`, `emailVerified`
- `createdAt`, `updatedAt`
- `profileVersionId` – pointer to latest profile version
- `privacy` – snapshot of privacy defaults (visibility + notification prefs)

### `health_profiles/{userId}`
- Root doc `current`, `targets`, `stats`
- Subcollection `versions/{versionId}` stores immutable normalized snapshots (`kg`/`cm`) with source + timestamps

### `consents/{userId}`
- `agreements` map keyed by consent type (`data_processing`, `ai_insights`, `marketing`)
- `sharingPreferences`, `notifications`
- `auditTrail` array capturing consent changes (type, previous/new status, actor, timestamp)

### `processed_metrics/{userId}/snapshots/{snapshotId}`
- `userMetrics` – AI-ready payload structure
- `privacyHash` – salted hash for anonymization
- `sourceProfileVersion` – reference to `health_profiles` version
- `createdAt`, optional `expiresAt`

### `ai_insight_logs/{userId}/insights/{insightId}`
- Stores prompt context, model name, response payload, status, timestamps

### `profile_exports/{userId}/exports/{exportId}` *(via Cloud Storage metadata)*
- Export metadata persisted as file metadata (path, status). Firestore collection optional if listing required later.

## Data Normalization Highlights
- Weight + target weight normalized to **kg** (two decimal precision)
- Height normalized to **cm** (supports metric + ft/in input)
- Enumerations constrain lifestyle/activity/goal vocab to align with AI prompts
- Numeric string coercion ensures friendly handling of form inputs
- BMI recalculated server-side using normalized metrics

## Authentication Workflow
1. **Registration** → Firebase Admin creates user, backend seeds `users` + `consents`
2. **Login** → Identity Toolkit `signInWithPassword` returns ID/refresh tokens
3. **OAuth (Google/Apple)** → Handled client-side; backend middleware validates issued ID tokens for protected APIs
4. **Refresh** → `/api/auth/refresh` wraps Secure Token API to exchange refresh tokens
5. **Authorization** → `auth-context` middleware verifies ID tokens and loads user context for downstream services

## Export Flow (Stage 1)
- `/api/export` triggers `export.service`, aggregates user summary, profile versions (latest 50), processed metrics, and AI logs
- Payload serialized to `exports/{userId}/{timestamp}.json` in Cloud Storage
- Signed URL (15 min validity) returned to client
- Future: move heavy lifting to Cloud Functions/Tasks and persist export registry in Firestore

## AI Anonymization Flow
- `/api/ai/prepare` checks `ai_insights` consent
- Fetches latest profile version, maps into AI payload contract
- Applies salted SHA-256 hash (`ANONYMIZATION_SALT:userId`) to remove direct identifiers
- Stores payload in `processed_metrics` + logs preparation event in `ai_insight_logs`
- Future stages: invoke AI models, manage responses, and version prompts

## Firebase Console Checklist
1. Enable Firestore (Native) & Cloud Storage (set default bucket)
2. Enable Auth providers: Email/Password, Google, Apple
3. Generate Web API key (Project settings → General → Web API Key)
4. Create service account key with admin privileges; store securely (base64 in env)
5. Configure email templates / SMTP for password reset (recommended)
6. Optionally create Cloud Storage lifecycle rules for `exports/` + `processed_metrics` retention

## Outstanding Tasks
- Add automated tests (unit + integration stubs)
- Harden security rules to mirror API authz once frontend flows are defined
- Wire actual AI provider integration (OpenAI/Vertex, etc.) in later roadmap phases
