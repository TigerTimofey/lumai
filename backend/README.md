# Numbers Don't Lie Backend

Backend service for the wellness platform. Provides Firebase Auth integration, health profile management, privacy/consent handling, data export scaffolding, and anonymized metrics preparation for AI workflows.

## Prerequisites
- Node.js 20+
- Firebase project with Firestore & Cloud Storage enabled
- Service account with permissions for Auth, Firestore, and Storage
- Enabled authentication providers: Email/Password, Google, Apple

## Setup
1. Create `.env` from `.env.example` and populate values:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (base64 encoded JSON)
   - `FIREBASE_STORAGE_BUCKET` (optional, defaults to `<projectId>.appspot.com`)
   - `WEB_API_KEY`
   - `ANONYMIZATION_SALT`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server:
   ```bash
   npm run dev
   ```

## Available Scripts
- `npm run dev` – start Express server with hot reload (tsx)
- `npm run build` – compile TypeScript to `dist`
- `npm start` – run compiled server
- `npm run lint` – run ESLint
- `npm test` – run Vitest test suite (placeholder)

## API Overview
- `POST /api/auth/register` – register user in Firebase Auth and bootstrap profile structures
- `POST /api/auth/login` – Firebase email/password sign-in
- `POST /api/auth/refresh` – exchange refresh token for new ID token
- `GET /api/profile` – fetch current health profile snapshot
- `PUT /api/profile` – create a new profile version & update summary (normalized kg/cm)
- `GET /api/profile/history` – list profile versions (paginated)
- `GET /api/profile/versions/:versionId` – fetch specific version
- `GET /api/privacy` – retrieve privacy and consent settings
- `PUT /api/privacy` – update privacy preferences
- `POST /api/privacy/consents` – change consent statuses with audit trail
- `POST /api/ai/prepare` – generate anonymized metrics snapshot (requires AI consent)
- `GET /api/ai/processed` – list processed metrics snapshots
- `GET /api/ai/insights` – list AI insight logs
- `POST /api/export` – export profile data to Cloud Storage and return signed URL

Protected endpoints require `Authorization: Bearer <Firebase ID token>` header.

## Pending Work / Notes
- OAuth flows (Google/Apple) are handled client-side; backend middleware verifies resulting ID tokens.
- Run `firebase login` & `firebase deploy` workflows after frontend integration (future stage).
- Ensure Firebase Storage bucket exists and allow service account to write `exports/` directory.
- Add automated tests once business logic stabilizes.
