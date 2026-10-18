# Notes material generation status

The materials overview now reports each tool as `not_requested`, `queued`,
`generating`, `ready`, or `failed`, plus `available` and `hasActiveJobs`.
The existing `generatedTypes`, `materials` and count fields still describe usable
saved content. Queued placeholders are excluded from those fields and return 404
from the content endpoint. Existing records with `generatedAt` remain ready.

Only the neutral revision summary is created automatically. Its job is saved before
the analyzed note is published. Student-requested support jobs and explicit tool
requests also save their queued states before the response. Optional tools are
not considered pending work just because their content does not exist.

The unique note/type index deduplicates active requests. Different tools requested
while another batch runs are retained and serialized per note within the process.
Workers renew a 60-second lease every 15 seconds, including queued work. Each tool
has a 120-second execution limit. An expired lease is marked failed on the next
overview read or generation request; interrupted work is retryable, not silently
resumed. This remains an in-process worker, not a durable queue with automatic
restart recovery. Underlying provider work can finish after the timeout, but its
result cannot update saved content. Generation-specific audio filenames also avoid
overwriting an earlier playable recording.

Conditional updates using a generation token prevent deleted or superseded work
being saved. Failed regeneration preserves the previous content. Errors returned
to students contain retry guidance rather than provider details.

The Notes screen sends one overview request at a time and schedules another only
when `hasActiveJobs` is true. It stops on terminal/idle states and connection or
authentication errors, and pauses after two minutes of continuous checking.
Individual HTTP requests time out after 15 seconds. Leaving the screen or
backgrounding the app cancels requests and timers. Returning to the screen or
pressing **Check again** starts a fresh check. A student can open ready content
while another tool is queued or generating, create an optional tool, or retry a
failed generation. An older ready version remains readable after a failed update.

Validation: `npm test` includes material lifecycle, duplicate requests, failures,
lease expiry, timeout/late-result protection, and deletion tests. Mobile
`npm run test:note-materials` covers polling termination, errors/recovery,
non-overlap, cancellation, session limits and labels. Disposable MongoDB/API
verification and a phone-width browser check are recorded in the workspace
`output/notes-materials-2026-10-16` folder. No trained model, shared app API client,
authentication provider or other member's service was changed for this fix.
