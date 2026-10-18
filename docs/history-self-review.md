# History integration self-review — 2026-10-15

The main service, persistent worker, mobile request/response contract, editable
review card, concept picker, demo reset, and Docker routing were reviewed.

## Fixes

The mobile client previously checked the returned concept ID and point quote
alignment, but could still accept a structurally valid result for different
submitted text. Response parsing now requires a successful envelope and the
exact active submitted text after the same deletion normalization used by the
service. It also checks concern quote offsets, requirement identities/uniqueness,
and matching model hashes. Seven History contract tests cover valid real API
fixtures and rejection of inconsistent or unrelated responses.

The demo's selected sample index previously prevented reselecting the active
sample from restoring its text after edits or manual concept changes. Each
sample selection now remounts the review card, resetting its source text,
concept, prior result, confirmation and pending request. Browser testing first
reproduced the failure, then verified that the original British-interest sample
was restored and `aria-checked` was false after the fix.

## Docker restoration

The temporary loopback gateway process was identified and stopped. The existing
`api_gateway` container was started, validated with `nginx -t`, and reloaded.
Expo was restarted in normal LAN/watch mode using its saved gateway URL
`http://192.168.1.20:8080`; its temporary localhost environment override was
removed without changing the saved mobile `.env`.

An initial suspicion of a 60-second Nginx timeout was disproved by reading the
entire configuration: the server already defines 300-second read/send timeouts,
inherited by the notes route. The unnecessary trial override was removed.
`Deployment-Infrastructure/nginx.conf` has no remaining changes from this review.

Local and LAN concept requests returned 200 from `nginx/1.28.3`, and the normal
note-service health route returned 200. Docker access logs recorded nine browser
History inference requests during the review. The temporary gateway header was
absent from the Docker regression run.

## Validation

- Main backend build and mobile TypeScript check passed.
- Seven mobile History contract tests, four existing Science contract tests,
  seven preview/worker tests and one History route test passed: 19 total.
- All 12 synthetic examples passed through Docker with full predictions identical
  to the saved baseline: labels, scores, quotes, offsets and review flags.
- Browser checks verified Complete, Partial, Missing and withheld output through
  the reviewed client and Docker gateway.
- Manual Grade 10 concept search/selection worked and the historical-sources
  complete example returned Complete with all three passages.
- Reselecting the active example restored its original text and cleared the
  scope confirmation. Editing still clears stale results and confirmation.

Raw Docker results:
`tmp/history-mobile-integration/gateway-api-check-docker.json`.
Screenshot: `tmp/history-mobile-integration/mobile-docker-review.jpg`.

The model remains unchanged at SHA256
`12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8`.
These are synthetic regression checks, not a new accuracy estimate. The known
semantic-entailment limitations, lack of real History handwriting validation,
and absence of native phone testing remain. The manual results are transient
review suggestions, not persisted grades or teacher assessments. Existing note
API authentication/deployment limitations are described in
`history-mobile-integration.md`; this review does not certify production security.
