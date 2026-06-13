# Tactile Diagram Workbench (Build Day)

Teacher-facing workbench for turning STEM diagrams into tactile-ready assets.
The current app shell is being pivoted from the earlier caption prototype into:
upload/import -> tactile SVG/PDF preview -> natural-language edits -> export.

## Run
```
npm install
npm run dev   # open the printed localhost URL
```

## Serverless SMILES parser

`/api/extract-smiles` is a Vercel function. It keeps the Anthropic key server-side
and returns a small parser payload for verifier lanes:

```json
{
  "smiles": "c1ccccc1",
  "confidence": "high",
  "warnings": []
}
```

Inputs:
- `imageDataUrl` for uploaded source diagrams.
- `imageBase64` + `mediaType` for preprocessed images.
- `svgText` for generated tactile SVGs that need structural parsing.

Required env:
- `ANTHROPIC_API_KEY`

Optional env:
- `ANTHROPIC_MODEL` (use the Build Day model when available; otherwise the
  function falls back to a stable Claude model string).
- `EXTRACT_SMILES_DEMO_KEY` protects public demos from unauthenticated parser
  spend. When set, `/api/extract-smiles` requires a matching `x-demo-key`
  request header and returns 401 before parsing the body or calling Anthropic.

Frontend code should call `src/api/extract-smiles.ts`; do not call Anthropic
directly from the browser. If the public demo sets `EXTRACT_SMILES_DEMO_KEY`,
pass that key to the wrapper from runtime input/config, not from source control:

```ts
await extractSmilesViaProxy(request, { demoKey });
```

For public deployments, either set `EXTRACT_SMILES_DEMO_KEY` with
`ANTHROPIC_API_KEY`, or omit `ANTHROPIC_API_KEY` and use fixture/gold-SMILES
examples as the video-demo fallback.

## Previous caption prototype

The caption pipeline remains in the repo until the tactile workbench replaces
the shell. It is no longer the locked project direction.

- `src/api/extract-smiles.ts` — typed frontend wrapper for the serverless parser.
- `src/types/caption-surface.ts` — **shared contract** (CaptionEvent / SpeakerState / EnvSound). Everyone imports this.
- `src/pipeline/` — realtime engine (fable, #90/#91): camera → face tracking → active-speaker → ASR → attributed `CaptionEvent`s.
  - `caption-surface-source.ts` — the `Pipeline` (event bus + lifecycle + stage wiring)
  - `asr-webspeech.ts` — ASR via Web Speech API (no key); swap for Deepgram later
  - `face-tracker-mediapipe.ts` — face + mouth-openness (MediaPipe; v0 stub)
  - `active-speaker.ts` — picks the active face from mouth motion
- `src/ui/` — room-aware Surface UI (codex #92) + craft (Ryo) — consume the event stream.

## Fallback (no camera / no visible face)
Captions still flow with `speakerId: null` / `faceBox: null` → UI shows a plain
caption stream (degraded mode). Anchoring is additive, never a hard dependency.
