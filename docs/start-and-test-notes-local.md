# Start the app and test Notes on PC or Expo Go

This guide uses the current local v2 textbook database, the Notes Docker backend,
and the existing private R2 image bucket. Choose the PC browser steps below or
the **Physical phone: Expo Go** section. It does not deploy Azure or require other members' APIs.
Internet is still needed for Clerk, MongoDB, R2 and Groq.

## 1. Open Docker Desktop

Wait until Docker is running. Existing credentials should remain in the private
Notes `.env` and `deployment/kb-v2-local/.env.local`. The frontend keeps its existing
Clerk configuration. No new secrets are needed for this startup guide.

## 2. PowerShell window 1: dependencies, Notes and local gateway

```powershell
cd "C:\Users\DLK\Desktop\RP_PROJECT_3\Smart-HandWritten-Note-Understanding-Service"

docker compose --env-file deployment/kb-v2-local/.env.local -f deployment/kb-v2-local/compose.yaml up -d

docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml -f deployment/r2-2026-10-19/notes.override.yaml -f deployment/podcast-2026-10-19/notes.override.yaml up -d --no-deps notes-coverage

Invoke-RestMethod http://127.0.0.1:8005/api/health

# For PC browser testing:
node deployment/local-test/notes-gateway.cjs
# For Expo Go on a phone, run this INSTEAD of the command above:
# node deployment/local-test/notes-gateway.cjs --lan
```

The health response should show `success: True` and `status: running`. The gateway
then reports that port 8080 forwards Notes requests to port 8005. Keep this window
open. If startup is still in progress, retry the health command after a few seconds.

This helper serves only `/api/notes/` and preserves backend Clerk authentication.
It does not start, edit or replace the team's Azure/shared gateway. If port 8080
is occupied, check the existing gateway first; do not stop an unrelated service.

The five Science/History textbooks are already ingested. For student note testing,
the Windows ingestion API and Celery worker do not need to run: Notes reads the
existing PostgreSQL/Qdrant data directly. Do not re-ingest duplicate textbooks.

## 3. PowerShell window 2: start the app

```powershell
cd "C:\Users\DLK\Desktop\RP_PROJECT_3\Mobile-Application"
$env:EXPO_PUBLIC_API_GATEWAY_URL="http://127.0.0.1:8080"
npm.cmd run web -- --localhost --port 8082
```

Keep this window open. The environment override applies to this terminal's app
process; it does not edit the shared frontend `.env` or another member's code.

Open **http://127.0.0.1:8082/notes**. Sign in with the existing account if prompted.
Use the same `127.0.0.1` browser address consistently. This loopback setup is for
the PC browser; use the phone instructions below for Expo Go. Other app sections
may need their own services, which this Notes-only test mode does not provide.

## Physical phone: Expo Go (Android or iPhone)

Connect the phone and PC to the same trusted Wi-Fi network. Keep Docker Desktop
and the Notes backend from step 2 running. This PC's Wi-Fi IPv4 address was
`192.168.1.20` when checked on 2026-10-19; check it again if your network changes:

```powershell
Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object InterfaceAlias,@{Name='IPv4';Expression={$_.IPv4Address.IPAddress}}
```

Use the Wi-Fi adapter's address below, not a VPN/virtual adapter or `127.0.0.1`.
On a physical phone, `127.0.0.1` refers to the phone itself.

### Window 1: make the Notes gateway reachable from the phone

If the browser helper is already running, stop that helper with Ctrl+C first.
Then run:

```powershell
cd "C:\Users\DLK\Desktop\RP_PROJECT_3\Smart-HandWritten-Note-Understanding-Service"
node deployment/local-test/notes-gateway.cjs --lan
```

The opt-in LAN mode listens on port 8080 on the PC's network interfaces and
prints their addresses. Only Notes routes are forwarded; normal authentication
is still required for student data. The default mode without `--lan` stays on
loopback. This is a local testing helper; stop it when you finish testing.

**Before launching Expo**, open this in your phone's browser:

**http://192.168.1.20:8080/api/notes/api/health**

It should return `success: true` and `status: running`. If it cannot connect,
check Docker/backend health first, then Windows Firewall: allow Node.js for the
trusted **Private** network, with inbound TCP ports 8080 and 8082 accessible on
that network. Keep the firewall enabled. Guest Wi-Fi/client isolation or a VPN
can block communication between the phone and PC.

### Window 2: launch Expo Go

Stop any previous Expo process using port 8082 with Ctrl+C. Then run:

```powershell
cd "C:\Users\DLK\Desktop\RP_PROJECT_3\Mobile-Application"
$env:EXPO_PUBLIC_API_GATEWAY_URL="http://192.168.1.20:8080"
npm.cmd run start -- --go --lan --port 8082 --clear
```

These settings apply to this terminal only. They do not edit the shared mobile
`.env`, sign-in code or other members' services. If the PC address changes,
replace it in the environment command and restart Expo.

Install an Expo Go build compatible with this project's **Expo SDK 54**. If the
installed Android build reports a version mismatch, select SDK 54 and Android
on [Expo's official download page](https://expo.dev/go?sdkVersion=54&platform=android&device=true).
For iPhone, follow [Expo's device/version guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

- **Android:** open Expo Go and scan the terminal QR code.
- **iPhone:** scan the QR code with Camera and open it in Expo Go. Allow Local
  Network access when prompted. If Expo asks for account sign-in, sign in to Expo
  Go and the PC's Expo CLI (`npx expo login`) with the same Expo account.
- The terminal should show an `exp://192.168.1.20:8082` address (or your current
  PC address), rather than `localhost`. `--go` selects Expo Go rather than a
  development build.

See [Expo's official device startup guide](https://docs.expo.dev/get-started/start-developing/)
for the QR and same-Wi-Fi flow. An Expo `--tunnel` connection tunnels the app
bundle, not this separate Notes API; it will not fix an unreachable LAN API.

### Test Notes on the phone

1. Sign in with your existing app account and open **Notes**.
2. Open a recent valid note and check its original images and saved analysis.
3. Upload one clear Science page from the gallery or camera. Grant photo/camera
   permissions when prompted, and choose the correct grade and lesson.
4. Leave processing using the app's Notes/back action, then reopen the note.
   Verify the extracted text and the concept checklist.
5. Generate **Structured Notes**, then **Flashcards**, and check both on the
   phone. Use the Science examples and detailed checks in steps 5-6 below.
6. Close and reopen Expo Go, return to Notes and confirm the saved note and its
   images still load. Delete only a disposable test upload if checking deletion.

Use the native app's navigation on the phone; the `127.0.0.1:8082` links in the
browser sections below are for the PC. Existing unrelated app sections may need
their own APIs. Notes' R2 credentials stay on the backend; none belong in Expo.

If Expo Go itself reports a missing native module, record the exact module/error
before changing dependencies. Some native features may require the team's
development build; this guide does not upgrade or reconfigure the shared app.

## 4. First test: existing notes and R2 images

1. Open an existing note owned by your signed-in account.
2. Open its original page images and move through every page.
3. Refresh the browser and reopen that note. Images and saved analysis should
   remain available.
4. Confirm the note's lesson, extracted text and concept checklist are sensible.

114 valid legacy images were migrated to R2. The older 75 missing sources and one
invalid source were already unavailable/invalid and need restoring or re-uploading;
use a recently uploaded valid note for the first test.

## 5. Test a fresh upload

1. Upload one clear English page first, using the app's upload action.
2. Choose Science, Grade 10 and **Chemical Basis of Life** for a supported model
   test, or choose the correct History grade/lesson for your actual note.
3. Submit the note and watch the real processing stages. You may return to Notes
   while it runs, then reopen the note.
4. Check the extracted text against the photo before interpreting coverage.
5. Open the concept checklist and inspect Complete, Partial or Missing findings,
   supporting passages and points to add. Your overall lesson assessment may also
   include AI findings; it is not entirely the trained model's output.
6. Refresh and confirm the uploaded image still loads. New uploads are stored in
   the existing R2 bucket.

Suggested **test inputs**, using three separate pages with the same Science
grade/lesson. Write or photograph these to test the full OCR flow:

| Intended coverage of Benedict's test | Example note |
| --- | --- |
| Complete | Add Benedict solution to the food sample. Heat the mixture in a hot water bath. A brick-red precipitate indicates reducing sugar. |
| Partial | Add Benedict solution to the food sample to test for reducing sugar. |
| Missing | Proteins are made of amino acids. Proteins are needed for growth and tissue repair. |

These are expected rubric cases, not guaranteed outputs. An unexpected label
requires checking OCR, the selected concept and evidence. A model suggestion can
be withheld when review is needed. Missing here means that the expected concept
was not found in this upload; it does not mean the student does not understand it.

Science's trained check runs automatically only for supported English concepts
with sufficient OCR and lesson confidence. History's trained check remains an
explicit review action, separate from the ordinary AI lesson analysis.

## 6. Test study materials

After analysis, open the study tools and select **Structured Notes**:

- The guide should cover the selected lesson's full concept checklist, with
  explanations and Partial/Missing markers matching the upload assessment.
- Check any diagrams, tables or charts for usefulness. Visuals are included only
  when supported by the retrieved content; every guide need not contain a graph.
- Compare one or two explanations with the lesson/reference material.

Then select **Flashcards**. Reveal answers, try hints when present, and use the
practice-again flow. Request tools one at a time for the first check. They generate
in the background; you can leave and reopen ready items. A full lesson guide can
take several minutes and consumes provider quota.

## 7. Test the live History model without another OCR upload

Open **http://127.0.0.1:8082/notes/history-model-demo** after signing in. Select a
synthetic example, confirm its English text/concept, then select **Check History
coverage**. This calls the packaged trained model through Notes. The first request
can take up to about 90 seconds while its worker loads. It does not test handwriting.

The Science `/notes/model-demo` page contains saved older synthetic results; use a
fresh supported Science upload to verify the currently deployed model instead.

## 8. Verify persistence and deletion

Restart only the Notes container, then reopen a valid note:

```powershell
cd "C:\Users\DLK\Desktop\RP_PROJECT_3\Smart-HandWritten-Note-Understanding-Service"
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml -f deployment/r2-2026-10-19/notes.override.yaml -f deployment/podcast-2026-10-19/notes.override.yaml restart notes-coverage
```

R2 images, saved results and completed materials should still be available. Delete
only a disposable test note when checking deletion. Its active image objects should
be removed from R2 and the note should disappear from the app. Historical migration
recovery copies are retained separately.

## Troubleshooting and stopping

| Symptom | Check |
| --- | --- |
| App says service unavailable | Backend health on 8005, gateway terminal on 8080, and the app process environment override above |
| Expo Go opens but Notes has network errors | The helper may still be running in browser mode. Stop that Notes helper with Ctrl+C and restart it with `node deployment/local-test/notes-gateway.cjs --lan`. The frontend's LAN API URL alone does not make a loopback-only server reachable. Check the health URL in the phone's browser, then reload Expo Go. |
| App still uses an old LAN address | Stop Expo with Ctrl+C and restart it from window 2 with the override; use `--clear` if the bundle remains stale |
| Sign-in fails | Existing Clerk configuration and allowed localhost/127.0.0.1 frontend origins; keep normal Notes authentication enabled |
| OCR/generation says temporarily busy | Groq quota/capacity; retry after the displayed interval or inspect an already analyzed note |
| Wrong concept results | Correct subject/grade/lesson, readable OCR, and whether the concept is supported by the trained model |
| Image fails | Use a recent valid note; check R2 access and the known old missing-file records |

To distinguish a gateway binding problem from an Expo problem:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8080,8082 | Format-Table LocalAddress,LocalPort
Invoke-RestMethod http://192.168.1.20:8080/api/notes/api/health
```

For phone testing, port 8080 must listen on `0.0.0.0` (or the PC's LAN address),
not only `127.0.0.1`. Expo's port 8082 must also accept LAN connections. The Notes
backend on 8005 can remain loopback-only: the LAN gateway forwards to it locally.
An address of `::` is an IPv6 wildcard; verify the IPv4 LAN URL as above as well.
Use your current Wi-Fi IP if it has changed. A health check from the PC confirms
the listener and backend, but a check from the phone also tests Wi-Fi/firewall access.

Backend logs, from the Notes folder:

```powershell
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml -f deployment/r2-2026-10-19/notes.override.yaml -f deployment/podcast-2026-10-19/notes.override.yaml logs --tail 80 notes-coverage
```

Use Ctrl+C in the gateway and Expo windows to stop those processes. If needed,
stop only Notes using the same Compose flags with `stop notes-coverage`. Keep the
named volumes; do not use `down -v` for routine stopping.
