# Responsive note processing - 2026-10-15

The reported five-page upload completed core analysis in 209,252 ms. OCR used 196,597 ms, including provider retries and rate limiting; one page could not be read. The app had been deriving stage checkmarks, 92% completion and a zero-second countdown from a fixed 32-second estimate. That display did not reflect server activity.

## Behavior

- Successful uploads return to Notes as soon as the service accepts them. Upload transfer still must finish; analysis continues on the backend. Processing notes remain accessible in the list and are refreshed until completion.
- The detail screen displays backend stage and OCR page information, elapsed time and an activity indicator. No completion percentage or remaining-time estimate is fabricated. Legacy records without progress metadata show an unspecified analysis state rather than invented completed stages.
- A prominent Continue using the app action and Back to Notes return directly to Notes, rather than relying on navigation history and potentially going back to the upload form.
- Connection failures are visible, failed initial reads can be retried, and the detail page does not issue overlapping status requests. Polling retries status reads; it does not submit a second analysis.
- Notes-list processing cards show the actual stage and background status instead of an arbitrary 40% bar. The existing analyzed-note bar continues to show note coverage, not job completion.
- Failed jobs show Failed in the header and return users to Notes. They are not labeled Analyzed.

The pipeline publishes stage changes and the OCR page being attempted. `processingProgress` contains the stage, completed stage names, current page when applicable, page count and start/update timestamps. The processing service writes updates to the note while it is processing and clears the field at terminal status. Publication errors do not discard usable analysis. OCR prompts, quality guards, model thresholds and provider retry limits are unchanged.

This removes the compulsory wait and misleading status display; it does not claim that OCR itself now takes less time. Backend analysis can still take several minutes. Background execution remains the existing in-process server implementation, not a durable queue that survives a server restart. No notification delivery while the app is closed is promised.

## Verification

- Backend TypeScript build and app TypeScript checks passed.
- Existing backend suite: 58 passed. New backend progress/schema tests: 4 passed. App progress tests: 5 passed. Temporary sign-in helper tests: 7 passed.
- A clearly labeled synthetic test record owned by a separate test identity was used to verify the running API and app. No AI calls or student-profile writes were made for that test. It stayed at OCR page 2 of 5 after several minutes, advanced only when its backend stage changed, supported leaving/reopening, and exited processing at failure. The exact fixture record was removed after verification.
- Original student upload remains analyzed, with the existing warning that only four of five pages were extracted.
- Proof, fixture cleanup manifest and backend restart logs are in workspace `output/processing-fix-2026-10-15/`.

Commands: backend `npm run test:processing-progress`; app `npm run test:note-processing`.

The local host backend on 8004 was rebuilt and restarted after verifying there were no recent processing jobs. The two preserved pending records were from July/August and were not modified. The gateway on 8080 continues to route the app to 8004. The separate packaged Docker backend on 8005 was not rebuilt in this change; rebuild the deployment image before shipping these backend updates.

These are intended processing fixes, separate from the user-designated temporary sign-in changes. The saved targeted sign-in rollback was applied on 18 October 2026; processing changes and existing model integration were preserved.
