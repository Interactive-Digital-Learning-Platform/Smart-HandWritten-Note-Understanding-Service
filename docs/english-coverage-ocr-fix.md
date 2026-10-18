# OCR content integrity repair

The three-page Chemical Basis of Life upload exposed duplicated OCR sections and
crossed-out writing being treated as active explanations. Pipeline version 2.1.1
addresses these failures before concept matching or trained-model inference.

- The full-page OCR prompt preserves struck-through writing inside `<deleted>`
  markers and distinguishes deletion from underlining.
- Repetition checks reject substantial repeated passages and restarted sections,
  including fragmented or reordered copies. The provider re-reads the image;
  the service does not silently delete repeated passages from a note.
- A focused crop of the lower fifth of the page checks faint final-line strikes.
  Its response can only annotate an exact, unique phrase on an exact OCR line.
  Ambiguous, invented, duplicate or truncated annotations cause a retry.
- Raw OCR retains deletion markers. Deterministic normalization excludes those
  phrases from analysis while keeping active replacements. A readability model
  can return a quality assessment but cannot rewrite the analyzed text.
- Malformed deletion markers or no remaining active text stop the pipeline.
  Cached reanalysis uses the raw OCR snapshot to preserve the deletion history.
- Transcription and the focused review each have a 25-second request timeout.

The crop review uses the same configured Groq vision provider as normal OCR;
it adds one bounded image request to each accepted page transcription. Sharp
0.34.5 is a declared dependency for in-memory image crops. Nothing is retrained.

Validation includes the backend build, 57 backend regression checks, and targeted
OCR/cleaning tests after the final crop change. The live upload verification is
recorded separately in the parent workspace's `tmp/ocr-refresh-verification.json`.
The original note OCR and analysis were preserved in a local before snapshot.

These checks are an AI-assisted comparison of this upload, not teacher validation
or an independent handwriting-accuracy benchmark. The quality score describes
readability of extracted text, not an OCR correctness probability. Very faint
deletions elsewhere on the page can still be missed by the full-page provider.
Intentional repeated long passages may trigger a conservative retry; model
suggestions remain review-required.
