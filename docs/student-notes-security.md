# Student Notes authentication and ownership — 16 October 2026

The first issue from the service review is fixed in source and enabled locally on both the gateway's host backend (8004) and the packaged Notes backend (8005).

## Access contract

- Student APIs require `Authorization: Bearer <current Clerk session token>`.
- The backend verifies RS256 signatures against the configured Clerk instance's cached public JWKS. It checks issuer, expiry, not-before, issued-at, user/session identifiers, pending-session status and authorized frontend origins. It never selects a key server from an unverified token.
- The server derives the student ID from verified claims. The optional legacy userId query may name only that same student. Upload body userId cannot impersonate another student.
- Note detail, processing, context edits, concept verification, consent, deletion, material operations and legacy analysis aliases require note ownership. Missing and foreign notes both return 404.
- Profile paths can select only the signed-in student's ID.
- History/ICT checks and curriculum routes also require student authentication. Public health remains available. Existing expert-review routes retain their separate expert authentication.
- There is no Notes authentication bypass; an old AUTH_BYPASS environment variable does not disable the checks.

Private media no longer uses public `express.static` routes. Photos require a matching owner-owned Note reference. Audio/transcripts require a matching owner-owned LearningMaterial and Note. Files are served only from the configured directory, with safe basenames, no directory listing, no-store caching and no session tokens in URLs. Authorized byte-range requests remain supported.

## Mobile/web integration

The Notes-only JSON and asset clients in Mobile-Application/api/notesClients.ts obtain a current session token from the existing Clerk instance before sending a request. The shared api/apiClients.ts and Clerk provider are unchanged. They reject absolute/external resource addresses before attaching credentials. Errors keep useful response status/message while removing request/config objects that could leak tokens into existing console logging.

The Notes flow redirects signed-out visitors to sign-in and remounts on account changes; the Notes home content also remounts by user identity. This prevents an account switch from retaining the previous screen's state.

`useNotesAsset` retrieves private media with authenticated requests. Web uses short-lived in-memory blob URLs. Native uses temporary cache files downloaded with bearer headers, avoiding expired-token problems during later media seeking. URLs/files are released on unmount, source change or account change. A force-killed native app can leave an OS-managed temporary cache file; this is not an encrypted offline-storage feature. No bearer token is put in an image/audio URL or saved with the downloaded file.

Photo and audio views show loading and retry states. Existing note data, model predictions, model artifact hashes and training behavior are unchanged.

## Required configuration

Both values are mandatory in local development and production:

```dotenv
CLERK_ISSUER_URL=https://your-instance.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=https://your-student-app.example
```

Use the exact Clerk instance origin and exact frontend origins, comma-separated. The local ignored `.env` was configured from the existing application's public Clerk publishable-key domain and its local/LAN web origins. No new login credentials or Clerk dashboard settings were created. Native tokens may omit azp; they still require a correctly signed session from the configured issuer. Browser origins and any supplied azp must be allowed. For deployment, configure the deployed frontend origin and use HTTPS for the app/API.

Public health stays at `/api/health`. The gateway path is `/api/notes/api/health`.

Authenticated developer HTTP scripts must pass a current session header. `verify:ict-integration -- --http` now reads `NOTES_SESSION_TOKEN` from its process environment. Do not commit that short-lived token, print it, or put it in a URL. Offline model-bridge verification requires no user token.

The new dependency is JOSE 6.2.12, locked in package-lock.json. Verification follows the public-key/JWKS approach described in [Clerk's manual JWT verification documentation](https://clerk.com/docs/guides/sessions/manual-jwt-verification).

## Validation

- Backend build passed; full `npm test` passed 65/65, including seven security integration cases.
- Generated synthetic RSA-signed sessions tested valid owner access, signature tampering, a foreign signing key, wrong issuer, expired/future claims, missing session ID, pending status, an untrusted authorized party and an untrusted browser origin.
- Foreign-student requests were rejected across note read/delete/process/context/verification/consent routes, material read/generate/delete routes, legacy analysis aliases and all profile variants.
- Lists and uploads were tested against forged client user IDs.
- Private asset tests covered anonymous/foreign reads, ignored query-token credentials, path traversal and authorized audio byte ranges.
- Mobile TypeScript passed. `npm run test:notes-auth` passed 4/4: bearer forwarding/refresh, signed-out failure, external-target rejection, and log sanitization.
- Through the actual gateway: health 200; anonymous note, material, analysis, photo/audio, History and ICT requests 401.
- Both 8004 and 8005 returned health 200 and private note/photo 401 without credentials. The rebuilt Docker container is healthy.
- In the signed-in web app, the existing note, its original photo and revision summary loaded. The photo decoded successfully from a private blob (1024 x 1536).
- A clearly marked synthetic media fixture loaded a one-second silent audio resource in the actual app. Its temporary note, material and file were removed afterward; no OCR/AI calls or profile writes occurred. This verifies authenticated loading; physical-device playback remains untested.

Local evidence: `output/notes-security-2026-10-16/` contains anonymous gateway checks, host/container checks, the private-photo screenshot, synthetic audio loading screenshot, cleaned-up fixture manifest and backend startup/log records. No session tokens or private signing keys were stored there.

Active host backend: PID 21796, port 8004. Packaged image: `smart-notes-coverage:science-v31-history-v51-ict-v31`, image identity `sha256:a374be74b03ed42babe4dea0ce4de96add4634973fb235ac018ee5bdda1cf5e5`. The rebuilt container retains its existing volumes and loopback-only port 8005 mapping.

## Scope and next work

This closes the reviewed Notes authentication/ownership gap. It is not a claim that the complete multi-service platform has passed a production security audit. Other services/infrastructure, HTTPS deployment, operational secret handling and physical-device testing require their own checks.

Next functional fixes remain: material job status/infinite polling, partial-concept counts, cached-OCR quality provenance, model availability/persistence, and student result clarity. A material-view follow-up should also render mathematical notation properly; raw LaTeX was visible in the existing Friction revision summary during verification.

The temporary sign-in/MFA UI changes were reverted on 18 October 2026 using the saved targeted patches. The sign-in screen matches the original committed source; the temporary adapter and its tests were removed. Permanent Notes token clients, ownership checks, private media hooks, route/session guards, processing changes and model integrations were preserved. No commit or push was performed.
