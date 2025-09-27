# Numbers Don't Lie Backend

Backend service for the wellness platform. Provides Firebase Auth integration, health profile management, privacy/consent handling, MFA-ready authentication, and anonymized metrics preparation for AI workflows.

## Prerequisites
- Node.js 20+
- Firebase project with Firestore enabled
- Service account with permissions for Auth and Firestore
- Enabled authentication providers: Email/Password, Google, GitHub (configure OAuth credentials in Firebase console)

> ℹ️ Cloud Storage integration for profile exports is deferred. Export endpoints currently return a 503 status until storage is configured in a later roadmap stage.

## Setup
1. Create `.env` from `.env.example` and populate values:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (base64 encoded JSON)
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

## Auth API Overview
- `POST /api/auth/register` – register user, auto-generate email verification link, seed profile docs
- `POST /api/auth/login` – email/password sign-in (supports optional MFA code)
- `POST /api/auth/oauth` – OAuth sign-in for `google.com` or `github.com` (expects provider tokens + optional MFA code)
- `POST /api/auth/refresh` – exchange refresh token for new ID token
- `POST /api/auth/password-reset` – generate password reset link
- `POST /api/auth/send-verification` – generate email verification link
- `POST /api/auth/mfa/enroll` – issue TOTP secret (protected route)
- `POST /api/auth/mfa/activate` – confirm TOTP code and enable MFA (protected route)
- `POST /api/auth/mfa/disable` – disable MFA and clear secret (protected route)

Protected routes require `Authorization: Bearer <Firebase ID token>` header.

## Profile & AI API Overview
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
- `POST /api/export` – returns 503 (export disabled until Storage integration)

## Pending Work / Notes
- Enable Firebase Storage and revisit export functionality in a future phase.
- Provide actual email delivery (SMTP or transactional service) for verification/reset links.
- Add automated tests once business logic stabilizes.
