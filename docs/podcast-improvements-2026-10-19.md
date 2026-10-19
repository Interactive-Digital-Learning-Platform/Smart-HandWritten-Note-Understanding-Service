# Notes study podcast update — 19 October 2026

Notes-only update. Existing Science/History models, authentication, R2 image
storage, knowledge-base schema and other members' functionality are unchanged.

## Student experience

The Notes podcast now has an orange lesson card, play/pause/replay, 15-second
back/forward controls, a tappable seek timeline, elapsed/remaining time and
0.75/1/1.25/1.5x playback speeds. Loading and buffering have a deadline and a
friendly retry state. Seeking errors are caught. A pending replay cannot start
after the screen loses focus. Playback pauses on navigation/backgrounding; no
shared app audio settings or microphone permissions are changed.

Follow-up: the main control has visible Play/Pause/Resume/Replay text alongside
its icon. Resume preserves the paused position. Header headphones and decorative
bars animate only during active playback, stop on pause/buffering/backgrounding,
and respect the device's reduced-motion setting. This is a mobile-only update;
it needs an Expo reload, not another Notes Docker rebuild.

Native visibility fix after a phone screenshot: the installed NativeWind native
inline-style resolver was reproduced returning `{}` for a callback style, removing
the orange background and size while white controls remained on a white card.
The main control now uses TouchableOpacity with fixed styles, and skips use fixed
style arrays. A regression test runs the rendered Play/Pause/Resume/Replay controls
through the installed native inline-style resolver and checks the visible orange
surface, touch size, labels and actions. Five focused podcast checks now pass.

Read along expands a selectable transcript. New MP3s save the exact narrated
script in the existing private material `textContent` field. Old MP3s continue
playing, but have no transcript unless one was already saved. Old script-only
TXT materials remain readable through the authenticated asset route and show
transcript loading/retry states. A recording is not invented when TTS is absent.

The material screen enables the existing Update version workflow for audio,
including generation status, bounded polling and preservation of old content.
Use it to create a new script/recording with a transcript. This makes normal
Groq and configured ElevenLabs requests and consumes their quota; simply opening
or playing a saved podcast does not regenerate it.

## Generation

The short recap prompt requests a learning focus, two or three connected ideas,
a supported example, a pause-and-recall question with its answer, and a practical
revision action. Relevant ingested textbook/curriculum context is now included
when retrieval succeeds; supplied note text is not treated as instructions or
automatically factually correct. This is a short recap, not a complete lesson.

Narration is bounded to 120–500 words and 6,500 characters, removes basic Markdown
formatting, and rejects empty/short/oversized scripts and unsupported stage/HTML
markup before TTS. Empty or non-audio speech-provider responses fail instead of
publishing a broken recording. The text stays alongside the recording, without
creating another asset endpoint or changing the material schema.

These are prompt/content-shape safeguards, not an independent factual review.
No live student-note Groq/ElevenLabs test was run for this change. Provider calls
in generation tests were mocked; recordings weren't listened to on a device.

## Validation

- Backend TypeScript build passed. Focused podcast/content/job suite: 29 passed.
- Mobile playback, transcript, material polling and asset failure tests: 13 passed.
- Relevant mobile TypeScript checks and lint passed; running Expo Android bundle
  compiled with the new player controls. Physical phone playback remains to check.
- New Notes Docker image: `smart-notes:podcast-v1-20261019`. The local Compose
  override is `deployment/podcast-2026-10-19/notes.override.yaml`.

## Local activation and rollback

From the Notes folder, add the podcast override last to the existing local setup:

```powershell
docker compose --env-file deployment/kb-v2-local/.env.local -f compose.coverage.yaml -f deployment/kb-v2-local/notes.override.yaml -f deployment/r2-2026-10-19/notes.override.yaml -f deployment/podcast-2026-10-19/notes.override.yaml up -d --no-deps notes-coverage
```

Only update when current upload/material jobs have finished. Existing named
volumes must remain attached. For rollback, run the previous command without the
podcast override, restoring `smart-notes-coverage:science-v35-history-v62-kb-v2-r2`.
Saved transcripts are backward-compatible metadata. Do not use `down -v`.

Reload Expo Go, open Notes -> an analyzed note -> Podcast/Audio Lesson. Try play,
pause, skips, timeline, speeds, replay and leaving/returning. For an older recording,
use Update version only when you want to request a new recording and transcript.

## Synced read-along highlighting

The active image is now `smart-notes:podcast-sync-v1-20261019` using the same local
podcast Compose override. New speech requests use ElevenLabs' documented
[speech-with-timing endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).
The original-text character alignment is validated against the exact narrated
script, converted into word timestamps with UTF-16 text offsets, and saved as
optional `LearningMaterial.transcriptCues`. Audio and timings come from the same
response; normalized text is not substituted for the student's transcript.

The app reads the player's real media position every 100ms. The current spoken
word is highlighted in orange, including after pauses, rewinds, replay, seeks and
speed changes. Highlighting follows media time, not a separate wall-clock timer.
Silent gaps have no highlighted word. The transcript can follow the current
paragraph; dragging it pauses automatic following, and Follow voice resumes it.
Labels and tap surfaces use fixed native styles to avoid the earlier invisible
button issue. No shared mobile configuration/dependencies changed.

Old recordings do not contain timestamps. They remain playable with a plain
transcript and an explanation. **Reload Expo Go, open the podcast, use Update
version once, wait for generation, then expand Read along and play.** This normal
generation action uses the existing Groq/ElevenLabs providers and their quota.
No previous recording/transcript is silently re-aligned, overwritten or sent out.

Validation: six backend podcast checks, eight mobile podcast/transcript checks,
TypeScript build/checks, lint and current Expo Android compilation passed. Tests
cover word and paragraph offsets, Unicode, malformed/out-of-order timestamps,
timing/transcript mismatch, silence and seeks. A single live provider check sent
only an assistant-authored synthetic sentence: 73,185 MP3 bytes and 12 word cues,
ending at 4.505 seconds. No student note, image or textbook content was sent in
that probe. Physical-device listening/highlight alignment remains to check.
