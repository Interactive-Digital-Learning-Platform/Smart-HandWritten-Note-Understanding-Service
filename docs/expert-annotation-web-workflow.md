# Live expert-annotation workflow

This workflow collects real notes while students use the application, but keeps
annotation, training, evaluation, and deployment as controlled offline steps. It
does not train a production model directly from student uploads or model-generated
labels.

## 1. Enable the isolated expert workspace

The workspace is disabled by default. Configure strong secrets through the
deployment secret manager, not source control:

```text
ANNOTATION_REVIEW_ENABLED=true
EXPERT_ANNOTATION_KEYS=science-expert-01=<random-key-at-least-16-characters>
ANNOTATION_PSEUDONYM_SECRET=<random-secret-at-least-32-characters>
RESEARCH_CONSENT_VERSION=1.0
ANNOTATION_ALLOWED_SUBJECTS=Science
```

Multiple experts use comma-separated `expert-id=access-key` entries. Expert IDs
become audit provenance. Each expert must receive a separate key. Serve the
workspace over HTTPS and rotate a key immediately if it is exposed.

After starting the service, open:

```text
http://localhost:3001/expert-annotation/
```

Through the existing local API gateway, open:

```text
http://localhost:8080/api/notes/expert-annotation/
```

The browser client derives the gateway prefix from its own URL, so both addresses
use the same build.

The legacy `/api/teacher` router remains unmounted. The new expert API is protected
independently under `/api/expert-annotations` and does not create a teacher role in
the student application.

## 2. Student upload consent

The mobile upload UI now shows a separate, unchecked research-consent control.
Normal note analysis works when the student declines. When the student opts in,
the client adds these multipart fields to `/api/notes/upload` or
`/api/notes/upload-and-process`:

```text
researchConsent=true
researchConsentVersion=1.0
```

Suggested plain-language consent:

> I agree that an anonymized copy of this note and its OCR text may be reviewed by
> approved subject experts and used to improve the note-understanding model. This
> is optional and does not affect my use of the app.

The API records the version and timestamp. After analysis, eligible Science notes
are automatically copied into the expert queue using deterministic HMAC
pseudonyms. Neither the student user ID nor public image URLs are returned by the
expert API.

The mobile note-detail screen shows the active research permission and requires a
confirmation before withdrawal. `EXPO_PUBLIC_RESEARCH_CONSENT_VERSION` in the
mobile environment should match `RESEARCH_CONSENT_VERSION` in this service.

Consent may be changed later:

```http
PATCH /api/notes/:noteId/research-consent
Content-Type: application/json

{"userId":"<authenticated-student-id>","status":"withdrawn"}
```

The API gateway must verify the authenticated student identity. The service also
checks that `userId` owns the note. Withdrawal removes the review snapshot and
unreleased annotations. Labels already locked into an immutable release are marked
ineligible for later releases and require a documented model-unlearning/retraining
decision.

## 3. Expert review

The browser UI supports:

- authenticated named experts;
- queued, in-review, submitted, and quarantined task lists;
- protected loading of original page images;
- raw OCR beside editable corrected text;
- subject and lesson confirmation;
- `present`, `partial`, and `missing` labels for every curriculum concept;
- exact evidence text and evidence page for `present`/`partial`;
- quarantine flags for wrong lesson, unreadable notes, duplicates, or personal
  data;
- drafts and final submission.

One expert submission produces `single_review` annotations. For
`present`/`partial`, the evidence must be a whitespace-normalized exact substring
of the declared page in the corrected text. `Missing` labels cannot contain
evidence. Quarantined notes require an explanation and do not produce training
labels.

## 4. Dataset release and retraining

Review collection is continuous; training is periodic. A practical first trigger
is at least 20 new independent student notes, followed by:

```powershell
npm run annotations:stats
npm run annotations:release -- `
  --version concepts-real-science-YYYY-MM-v1 `
  --subject Science `
  --minimum-quality single_review
```

Every released row includes an `evaluationGroupId`. Split by this student/author
group, not by note or concept. Keep validation/test student groups locked and never
use the test set to select hyperparameters.

Retrain the page-aware XLM-R experiment only after checking label balance and
review quality. A candidate model stays disabled until it beats the deployed model
on the locked real-note test set, including per-class, grade, and language metrics.
Deployment should use a feature flag, monitoring, and rollback; it is never a
side effect of expert submission.

## 5. Operational safeguards

- Restrict MongoDB, upload storage, and the expert workspace to approved staff.
- Use HTTPS; expert bearer keys must never travel over plain internet HTTP.
- Do not include student IDs in reviewer comments or corrected text.
- Review a random sample as well as low-confidence notes to avoid active-learning
  bias.
- Double-review 10–20% of notes and adjudicate disagreements before raising their
  label quality.
- Back up dataset manifests and model metadata, not uncontrolled exports of
  handwritten images.
