# Build Brief

Status: locked for Build Day.

## Project Direction

An open-source compiler that turns a STEM diagram into a tactile sheet a blind
student can read by touch.

The pipeline is one front door with several entry types:

- upload an image of a diagram, or
- type a molecule name or short concept, or
- bring a non-chemistry diagram (biology, physics, a labeled figure).

The compiler extracts the structure, lays it out as a tactile drawing, replaces
printed text with grade-1 braille labels, and runs a verifier that only marks a
sheet `verified` when the recovered structure round-trips back to the input.
Chemistry is the deepest, fully verified lane; other subjects land in a clearly
marked `draft / teacher review` lane so a sighted teacher can confirm before a
student relies on it.

Two more things make it usable in a real classroom:

- the sheet can be edited in plain language ("make the labels bigger", "drop the
  lone-pair dots"), so a teacher does not need a CAD tool, and
- the output is a print sheet sized for a low-cost desktop braille embosser, so
  the artifact is a real page on real paper, not a screenshot.

The whole thing runs as a single web page so a teacher can use it from a laptop
with nothing to install.

## User / Audience

Primary: teachers of blind and low-vision students — including teachers of the
visually impaired (TVIs) — who today hand-build tactile diagrams one at a time,
which is slow and does not scale to a full lesson's worth of figures.

Secondary: blind and low-vision STEM students themselves, who get a consistent,
readable tactile sheet instead of an ad-hoc swell-paper drawing whose labels
vary by whoever made it.

The hard before/after: producing one classroom-ready tactile chemistry figure
drops from "an afternoon of manual work" to "type or upload, review, print."

## One-Minute Demo Shape

1. Open the web app. One screen, no setup.
2. Type a molecule (e.g. "acetic acid") OR upload a diagram image.
3. The compiler extracts the structure and renders a tactile sheet with braille
   labels; the verifier badge flips from `unverified` to `verified` once the
   structure round-trips.
4. Edit in plain language — "make the labels bigger" — and watch the sheet
   update in place (before/after is visible).
5. Open the print preview: a real embosser-sized page.
6. Upload a non-chemistry diagram to show the `draft / teacher review` lane —
   the system is honest about what it has and has not verified, instead of
   faking confidence.

## Public Sources

Use only public standards and public open-source tooling. No private data.

- Unicode Braille Patterns block (U+2800–U+28FF) — the standard code points used
  to render braille cells. <https://www.unicode.org/charts/PDF/U2800.pdf>
- SMILES — the public line notation for molecular structure used as the
  chemistry interchange format.
- RDKit — open-source cheminformatics toolkit used to parse and lay out
  molecular structure. <https://www.rdkit.org>
- Grade-1 (uncontracted) braille for labels; chemistry notation follows the
  public conventions used in tactile science materials.
- Low-cost desktop braille embossers that accept a standard print sheet as the
  output target (the demo sizes its sheet to that page format).

## Non-Goals

- Do not include private transcripts.
- Do not include credentials, tokens, private emails, or personal data.
- Do not import assumptions from older private project history unless rewritten
  as public-safe requirements.
- Not a replacement for a teacher's judgment: unverified subjects stay in the
  review lane on purpose.
- Not a general image-to-image model; the chemistry lane is verified structure,
  not a guessed picture.
