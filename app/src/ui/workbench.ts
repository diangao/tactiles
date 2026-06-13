/**
 * Single-screen tactile workbench UI.
 *
 * Home is a live braille translator: any typed/pasted text is compiled to real
 * BANA 6-dot geometry as you type — no fixtures, no presets. The dots are
 * computed from the text, and the same primitive drives the emboss-ready print
 * sheet and the .brf (Braille Ready Format) export an embosser reads directly.
 *
 * A diagram workbench sits below: load/upload a STEM diagram, see Source vs
 * Tactile, and drive deterministic edit ops by natural language (the model only
 * picks an op tag; it never rewrites the SVG). Consumes the harness `mockNodes`
 * behind the `HarnessNodes` seam, so real parse/compile nodes swap in without
 * touching this file. Plain DOM, no framework.
 */

import { mockNodes } from "../harness/mock";
import {
  resolveEditCommand,
  describeOp,
  type EditSource,
} from "../harness/edit-resolve";
import { CHEM_FIXTURES } from "../fixtures/chem";
import { toBraille } from "../harness/braille";
import {
  brailleLabelSVG,
  brailleLabelWidth,
  PRINT_BRAILLE_MM,
  type BrailleStyle,
} from "../harness/braille-render";
import { atomDisplayLabel, implicitHydrogenSummary } from "../harness/chem-labels";
import type {
  Atom,
  Bond,
  ChemIR,
  DiagramAsset,
  EditOp,
  UploadedFile,
} from "../harness/contracts";

const nodes = mockNodes;

interface LogEntry {
  utterance: string;
  op: EditOp | null;
  source: EditSource; // llm = model mapped it; fallback = regex floor; none = no match
  reason?: string; // human-readable summary (model- or rule-provided)
}

interface WorkbenchState {
  assets: DiagramAsset[];
  activeId: string | null;
  lastEdit: LogEntry | null;
  resolving: string | null; // utterance currently being resolved (loading state)
  translatorText: string;
}

const state: WorkbenchState = {
  assets: [],
  activeId: null,
  lastEdit: null,
  resolving: null,
  translatorText: "Acetic acid CH3COOH",
};

type SourceViewState = {
  strokeWidth: number;
  labelSize: number;
  doubleBondGap: number;
  coordScale: number;
  cleaned: boolean;
  edits: string[];
};

const DEFAULT_SOURCE_VIEW: SourceViewState = {
  strokeWidth: 4,
  labelSize: 20,
  doubleBondGap: 5,
  coordScale: 112,
  cleaned: false,
  edits: [],
};

const sourceViews = new Map<string, SourceViewState>();

export async function mount(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  root.appendChild(buildHeader());
  root.appendChild(buildMain());
  root.appendChild(buildFooter());

  // Pre-load the example molecules so chips/cards are instant, but home stays
  // on the live translator until the teacher picks a diagram or uploads one.
  state.assets = await Promise.all(
    CHEM_FIXTURES.map((fx) => loadExampleAsset(fx.name)),
  );
  rerender();
}

// ── Pipeline helpers ────────────────────────────────────────────────────

async function loadExampleAsset(name: string): Promise<DiagramAsset> {
  // parse() resolves a fixture by normalized name, so "Acetic acid" works.
  // Carry the fixture's clean skeletal-formula image as the Source depiction —
  // the original diagram, NOT the generated braille (that's the Tactile pane).
  const src = CHEM_FIXTURES.find((f) => f.name === name)?.sourceImage;
  const file: UploadedFile = {
    name,
    mime: src?.mime ?? "image/svg+xml",
    dataUrl: src?.dataUrl ?? "",
  };
  let asset = await nodes.ingest(file);
  const ir = await nodes.parse(asset);
  asset = { ...asset, goldIR: ir, ir, status: "parsed" };
  const tactile = await nodes.compile(ir);
  return { ...asset, tactile, status: "verified" };
}

// Per-asset parse failure message (e.g. unreadable upload, API key not set).
// UI-local so contracts stay clean; the asset carries status "error".
const parseError = new Map<string, string>();

// ── Real-time braille translator ─────────────────────────────────────────

// Screen preview: faint guide rings mark un-raised dot positions so a cell
// reads as a braille cell even when sparse.
const PREVIEW_BRAILLE: BrailleStyle = {
  dotPitch: 2.5,
  cellAdvance: 6.0,
  dotRadius: 0.85,
  showFlat: true,
  raisedFill: "#141414",
  flatStroke: "#cfc9bb",
};

// North American Braille ASCII order, indexed by braille cell code-point offset
// (U+2800 + k). A standard public mapping; an embosser reads these characters
// directly from a .brf file.
const BRAILLE_ASCII =
  " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";

function wrapToLines(text: string, cellsPerLine: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = para.split(" ");
    let cur = "";
    for (const w of words) {
      let word = w;
      while (word.length > cellsPerLine) {
        if (cur) {
          out.push(cur);
          cur = "";
        }
        out.push(word.slice(0, cellsPerLine));
        word = word.slice(cellsPerLine);
      }
      const candidate = cur ? `${cur} ${word}` : word;
      if (candidate.length > cellsPerLine && cur) {
        out.push(cur);
        cur = word;
      } else {
        cur = candidate;
      }
    }
    out.push(cur);
  }
  return out.length ? out : [""];
}

function brailleBlock(
  text: string,
  style: BrailleStyle,
  cellsPerLine: number,
): { body: string; widthMm: number; heightMm: number } {
  const lines = wrapToLines(text, cellsPerLine);
  const pad = style.dotRadius + 1.2;
  const lineAdvance = style.dotPitch * 4;
  let body = "";
  let maxW = style.dotPitch;
  lines.forEach((line, li) => {
    const y = pad + li * lineAdvance;
    body += brailleLabelSVG(line, pad, y, style);
    maxW = Math.max(maxW, brailleLabelWidth(line, style));
  });
  return {
    body,
    widthMm: pad * 2 + maxW,
    heightMm: pad * 2 + (lines.length - 1) * lineAdvance + style.dotPitch * 2,
  };
}

function previewSvg(text: string): string {
  const { body, widthMm, heightMm } = brailleBlock(text, PREVIEW_BRAILLE, 28);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm.toFixed(1)} ${heightMm.toFixed(1)}"` +
    ` preserveAspectRatio="xMinYMin meet" role="img" aria-label="braille preview">${body}</svg>`
  );
}

function braillePrintSheet(text: string): string {
  const style = PRINT_BRAILLE_MM; // raised dots only — emboss-safe
  const pageW = 210;
  const pageH = 297;
  const margin = 18;
  const cellsPerLine = Math.max(
    1,
    Math.floor((pageW - margin * 2 - style.dotPitch) / style.cellAdvance) + 1,
  );
  const lines = wrapToLines(text, Math.min(cellsPerLine, 40));
  const lineAdvance = style.dotPitch * 4;
  const y0 = margin + style.dotPitch;
  let body = "";
  lines.forEach((line, li) => {
    body += brailleLabelSVG(line, margin, y0 + li * lineAdvance, style);
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}"` +
    ` width="${pageW}mm" height="${pageH}mm">` +
    `<rect width="${pageW}" height="${pageH}" fill="#ffffff"/>${body}</svg>`
  );
}

function buildBrf(text: string): string {
  const lines = wrapToLines(text, 40).map((line) =>
    [...toBraille(line)]
      .map((ch) => {
        const code = (ch.codePointAt(0) ?? 0) - 0x2800;
        return code >= 0 && code < BRAILLE_ASCII.length ? BRAILLE_ASCII[code] : ch;
      })
      .join(""),
  );
  return `${lines.join("\r\n")}\r\n`;
}

function buildTranslator(): HTMLElement {
  const card = el("section", "tw-translator");
  card.innerHTML = `
    <div class="tw-translator-head">
      <h2>Live braille translator</h2>
      <p>Type or paste anything — it becomes real, emboss-ready braille as you type. No presets, no fixtures: the dots are computed from your text.</p>
    </div>
    <div class="tw-translator-grid">
      <label class="tw-translator-input">
        <span class="tw-field-label">Text</span>
        <textarea id="tw-tr-input" rows="7" spellcheck="false"></textarea>
      </label>
      <div class="tw-translator-output">
        <span class="tw-field-label">Braille · BANA 6-dot</span>
        <div class="tw-translator-dots" id="tw-tr-dots"></div>
        <div class="tw-translator-unicode" id="tw-tr-uni"></div>
      </div>
    </div>
    <div class="tw-translator-bar">
      <span class="tw-translator-meta" id="tw-tr-meta"></span>
      <div class="tw-translator-actions">
        <button type="button" class="tw-export" id="tw-tr-print">Print braille</button>
        <button type="button" class="tw-export tw-export-primary" id="tw-tr-brf">Download .brf (embosser)</button>
        <button type="button" class="tw-export" id="tw-tr-svg">Download .svg</button>
      </div>
    </div>
  `;
  const ta = card.querySelector("#tw-tr-input") as HTMLTextAreaElement;
  ta.value = state.translatorText;
  ta.placeholder =
    "e.g. Acetic acid CH3COOH\nThe cell membrane is selectively permeable.";
  ta.addEventListener("input", () => {
    state.translatorText = ta.value;
    updateTranslatorOutput();
  });
  card
    .querySelector("#tw-tr-print")
    ?.addEventListener("click", () => openTranslatorPrint(state.translatorText));
  card.querySelector("#tw-tr-brf")?.addEventListener("click", () =>
    downloadBlob(
      "braille.brf",
      new Blob([buildBrf(state.translatorText)], { type: "text/plain" }),
    ),
  );
  card.querySelector("#tw-tr-svg")?.addEventListener("click", () =>
    downloadBlob(
      "braille.svg",
      new Blob([braillePrintSheet(state.translatorText)], {
        type: "image/svg+xml",
      }),
    ),
  );
  return card;
}

function updateTranslatorOutput(): void {
  const dots = document.getElementById("tw-tr-dots");
  const uni = document.getElementById("tw-tr-uni");
  const meta = document.getElementById("tw-tr-meta");
  const text = state.translatorText;
  if (dots)
    dots.innerHTML = text.trim()
      ? previewSvg(text)
      : '<p class="tw-pane-empty">Braille appears here as you type.</p>';
  if (uni) uni.textContent = toBraille(text);
  if (meta) {
    const cells = [...toBraille(text.replace(/\n/g, ""))].length;
    meta.textContent = `${cells} cell${cells === 1 ? "" : "s"} · emboss-ready · Grade 1 (uncontracted)`;
  }
}

function openTranslatorPrint(text: string): void {
  const sheet = braillePrintSheet(text);
  const overlay = el("div", "tw-print-overlay");
  const close = (): void => {
    overlay.remove();
    document.body.classList.remove("tw-print-mode");
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.innerHTML = `
    <div class="tw-print-toolbar">
      <span>Emboss-ready braille sheet</span>
      <div class="tw-print-actions">
        <button type="button" class="tw-export" id="tw-tp-print">Send to printer</button>
        <button type="button" class="tw-export" id="tw-tp-brf">Download .brf</button>
        <button type="button" class="tw-export" id="tw-tp-svg">Download .svg</button>
        <button type="button" class="tw-export" id="tw-tp-close">Close</button>
      </div>
    </div>
    <div class="tw-print-sheet">${sheet}</div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("tw-print-mode");
  overlay.querySelector("#tw-tp-close")?.addEventListener("click", close);
  overlay
    .querySelector("#tw-tp-print")
    ?.addEventListener("click", () => window.print());
  overlay.querySelector("#tw-tp-brf")?.addEventListener("click", () =>
    downloadBlob("braille.brf", new Blob([buildBrf(text)], { type: "text/plain" })),
  );
  overlay.querySelector("#tw-tp-svg")?.addEventListener("click", () =>
    downloadBlob("braille.svg", new Blob([sheet], { type: "image/svg+xml" })),
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function buildHeader(): HTMLElement {
  const header = el("header", "tw-header");
  const title = el("button", "tw-title") as HTMLButtonElement;
  title.type = "button";
  title.innerHTML =
    `<strong>Tactile Workbench</strong>&nbsp;` +
    `<span>open-source braille compiler for blind STEM students</span>`;
  title.addEventListener("click", goHome);
  header.appendChild(title);
  return header;
}

function buildDropzone(): HTMLLabelElement {
  const drop = el("label", "tw-dropzone tw-dropzone-compact") as HTMLLabelElement;
  const inputId = `tw-drop-${Math.random().toString(36).slice(2, 7)}`;
  drop.setAttribute("for", inputId);
  drop.innerHTML = `
    <div class="tw-dropzone-icon">↑</div>
    <div class="tw-dropzone-title">Upload a diagram</div>
    <div class="tw-dropzone-sub">PDF, PNG, or screenshot → emboss-ready tactile sheet with real braille labels.</div>
  `;
  const input = el("input") as HTMLInputElement;
  input.type = "file";
  input.id = inputId;
  input.accept = "image/*,application/pdf";
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void handleUpload(file);
    input.value = "";
  });
  drop.appendChild(input);
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.setAttribute("data-drag", "true");
  });
  drop.addEventListener("dragleave", () => drop.removeAttribute("data-drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.removeAttribute("data-drag");
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleUpload(file);
  });
  return drop;
}

// ── Main (home translator OR diagram panes) ─────────────────────────────

function buildMain(): HTMLElement {
  const main = el("main", "tw-main");
  main.id = "tw-main";
  return main;
}

function renderMain(): void {
  const main = document.getElementById("tw-main");
  if (!main) return;
  main.innerHTML = "";
  const asset = activeAsset();
  if (!asset) {
    main.appendChild(buildHome());
    updateTranslatorOutput();
  } else {
    main.appendChild(buildPanes(asset));
  }
}

function buildHome(): HTMLElement {
  const wrap = el("div", "tw-empty");
  const home = el("div", "tw-home");
  home.appendChild(buildTranslator());

  const sep = el("div", "tw-home-sep");
  sep.innerHTML = `<span>Or compile a STEM diagram to tactile</span>`;
  home.appendChild(sep);

  const diagram = el("div", "tw-home-diagram");
  diagram.appendChild(buildDropzone());

  const cards = el("div", "tw-example-cards");
  for (const fx of CHEM_FIXTURES) {
    const card = el("button", "tw-example-card");
    card.type = "button";
    card.innerHTML =
      `<span class="tw-example-card-name">${escapeHtml(fx.name)}</span>` +
      `<span class="tw-example-card-formula">${escapeHtml(fx.formula)}</span>`;
    card.addEventListener("click", () => selectByName(fx.name));
    cards.appendChild(card);
  }
  diagram.appendChild(cards);
  home.appendChild(diagram);

  wrap.appendChild(home);
  return wrap;
}

function buildPanes(asset: DiagramAsset): HTMLElement {
  const view = el("div", "tw-workview");

  const bar = el("div", "tw-workbar");
  const back = el("button", "tw-back") as HTMLButtonElement;
  back.type = "button";
  back.textContent = "← Translator";
  back.addEventListener("click", goHome);
  bar.appendChild(back);
  const name = el("span", "tw-workbar-name");
  name.textContent = asset.name;
  bar.appendChild(name);
  view.appendChild(bar);

  const panes = el("div", "tw-panes");

  // Source pane — the teacher-readable current diagram. It mirrors deterministic
  // edits so a sighted teacher can catch the same source-level change before
  // printing the tactile sheet. The original upload stays available as reference.
  const source = el("section", "tw-pane");
  source.innerHTML = `
    <div class="tw-pane-header"><span>Teacher-readable source</span>${trustChip(asset)}</div>
    <div class="tw-pane-body tw-pane-body-source">${teacherSourceBody(asset)}</div>
  `;
  panes.appendChild(source);

  // Tactile pane — working braille render, or a readable failure for uploads the
  // model couldn't parse.
  const tactile = el("section", "tw-pane");
  const svg = asset.tactile?.svg ?? "";
  let tactileBody: string;
  if (asset.status === "error") {
    const msg = parseError.get(asset.id) ?? "Couldn't read this diagram.";
    tactileBody = `<p class="tw-pane-error">${escapeHtml(msg)}</p>`;
  } else {
    tactileBody = `<div class="tw-pane-stage">${svg || '<p class="tw-pane-empty">Reading the structure…</p>'}</div>`;
  }
  tactile.innerHTML = `
    <div class="tw-pane-header">
      <span>Tactile raised-line sheet</span>
      <span class="tw-pane-status" data-state="soft"><span class="tw-pane-status-dot"></span>SVG/PDF + .brf</span>
    </div>
    <div class="tw-pane-body">${tactileBody}</div>
  `;
  panes.appendChild(tactile);

  view.appendChild(panes);
  return view;
}

function trustChip(asset: DiagramAsset): string {
  if (asset.status === "error") {
    return paneStatus("warn", "needs review");
  }
  if (!asset.ir) {
    return paneStatus("idle", "reading");
  }
  if (asset.report && !asset.report.pass) {
    return paneStatus("warn", "verifier flagged");
  }
  if (asset.kind === "chemistry") {
    return paneStatus("ok", "verifier ready");
  }
  return paneStatus("soft", "LLM-judged draft");
}

function paneStatus(stateName: "ok" | "warn" | "soft" | "idle", label: string): string {
  return (
    `<span class="tw-pane-status" data-state="${stateName}">` +
    `<span class="tw-pane-status-dot"></span>${escapeHtml(label)}</span>`
  );
}

function teacherSourceBody(asset: DiagramAsset): string {
  if (!asset.ir) {
    return sourceBody(asset.source);
  }

  const sourceView = sourceViewFor(asset.id);
  const edits = sourceView.edits.length
    ? sourceView.edits.map((edit) => `<li>${escapeHtml(edit)}</li>`).join("")
    : "<li>Current source mirrors the recognized chemistry structure.</li>";
  const hNotes = implicitHydrogenSummary(asset.ir);
  const hydrogens = hNotes.length
    ? `<li>Implicit hydrogens are made explicit in labels: ${escapeHtml(hNotes.join("; "))}</li>`
    : "";
  const issueBanner =
    asset.report && !asset.report.pass
      ? verifierBanner(asset.report.diffs.map((d) => d.detail))
      : "";

  return `
    <div class="tw-source-stack">
      <div class="tw-source-current">
        <div class="tw-source-note">
          <strong>${escapeHtml(asset.ir.smiles)}</strong>
          <span>teacher source updates with every safe edit</span>
        </div>
        <div class="tw-source-stage">${teacherSourceSvg(asset.ir, sourceView)}</div>
        <ul class="tw-source-edits">${edits}${hydrogens}</ul>
        ${issueBanner}
      </div>
      <details class="tw-source-original">
        <summary>Original upload reference</summary>
        <div class="tw-source-thumb">${rawSourceMarkup(asset.source)}</div>
      </details>
    </div>
  `;
}

function verifierBanner(details: string[]): string {
  const items = details
    .slice(0, 4)
    .map((detail) => `<li>${escapeHtml(detail)}</li>`)
    .join("");
  return `
    <div class="tw-verifier-banner">
      <strong>Verifier caught a structural drift.</strong>
      <span>The teacher-readable source and tactile render now differ from the recognized gold structure.</span>
      <ul>${items}</ul>
    </div>
  `;
}

function sourceViewFor(assetId: string): SourceViewState {
  const cur = sourceViews.get(assetId);
  return cur ? { ...cur, edits: [...cur.edits] } : { ...DEFAULT_SOURCE_VIEW, edits: [] };
}

function applySourceEdit(op: EditOp, assetId: string): void {
  const next = sourceViewFor(assetId);
  switch (op.kind) {
    case "enlargeLabels":
      next.labelSize *= op.factor ?? 1.4;
      next.edits.push(describeOp(op));
      break;
    case "thickenLines":
      next.strokeWidth *= op.factor ?? 1.5;
      next.edits.push(describeOp(op));
      break;
    case "emphasizeDoubleBonds":
      next.doubleBondGap *= 1.7;
      next.edits.push(describeOp(op));
      break;
    case "spaceLabels":
      next.coordScale *= op.factor ?? 1.3;
      next.edits.push(describeOp(op));
      break;
    case "removeBackground":
      next.cleaned = true;
      next.edits.push(describeOp(op));
      break;
    case "export":
      return;
  }
  sourceViews.set(assetId, next);
}

function teacherSourceSvg(ir: ChemIR, opts: SourceViewState): string {
  const pad = 58;
  const px = (a: Atom) => a.x * opts.coordScale;
  const py = (a: Atom) => a.y * opts.coordScale;
  const xs = ir.atoms.map(px);
  const ys = ir.atoms.map(py);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + pad * 2;
  const h = Math.max(...ys) - minY + pad * 2;
  const X = (a: Atom) => px(a) - minX + pad;
  const Y = (a: Atom) => py(a) - minY + pad;

  const bondLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dx = 0,
    dy = 0,
  ) =>
    `<line x1="${(x1 + dx).toFixed(1)}" y1="${(y1 + dy).toFixed(1)}" ` +
    `x2="${(x2 + dx).toFixed(1)}" y2="${(y2 + dy).toFixed(1)}" ` +
    `stroke="#171717" stroke-width="${opts.strokeWidth.toFixed(1)}" stroke-linecap="round"/>`;

  const bonds = ir.bonds.map((bond) => renderTeacherBond(ir, bond, X, Y, opts, bondLine)).join("");
  const atoms = ir.atoms
    .map((atom) => {
      const label = escapeHtml(atomDisplayLabel(ir, atom));
      const x = X(atom);
      const y = Y(atom);
      const r = opts.labelSize * 0.8;
      return (
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" stroke="#f2eee5" stroke-width="2"/>` +
        `<text x="${x.toFixed(1)}" y="${(y + opts.labelSize * 0.34).toFixed(1)}" ` +
        `font-size="${opts.labelSize.toFixed(1)}" font-family="JetBrains Mono, ui-monospace, monospace" ` +
        `font-weight="700" text-anchor="middle" fill="#171717">${label}</text>`
      );
    })
    .join("");

  const bg = opts.cleaned ? "#ffffff" : "#fffdf8";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}"` +
    ` role="img" aria-label="teacher-readable current chemical source">` +
    `<rect width="100%" height="100%" fill="${bg}"/>${bonds}${atoms}</svg>`
  );
}

function renderTeacherBond(
  ir: ChemIR,
  bond: Bond,
  X: (atom: Atom) => number,
  Y: (atom: Atom) => number,
  opts: SourceViewState,
  line: (x1: number, y1: number, x2: number, y2: number, dx?: number, dy?: number) => string,
): string {
  const a1 = ir.atoms[bond.a];
  const a2 = ir.atoms[bond.b];
  const x1 = X(a1);
  const y1 = Y(a1);
  const x2 = X(a2);
  const y2 = Y(a2);
  if (bond.order === 1) return line(x1, y1, x2, y2);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * opts.doubleBondGap;
  const oy = (dx / len) * opts.doubleBondGap;
  const pair = line(x1, y1, x2, y2, ox, oy) + line(x1, y1, x2, y2, -ox, -oy);
  return bond.order === 3 ? line(x1, y1, x2, y2) + pair : pair;
}

// Render the original Source file. Trusted fixture SVGs are inlined for crisp
// scaling; uploads arrive as base64 from FileReader and render as sandboxed
// <img>, so embedded SVG script can never execute.
const FIXTURE_SVG_PREFIX = "data:image/svg+xml;utf8,";

function sourceBody(src: UploadedFile): string {
  return `<div class="tw-pane-stage">${rawSourceMarkup(src)}</div>`;
}

function rawSourceMarkup(src: UploadedFile): string {
  if (!src.dataUrl) {
    return '<p class="tw-pane-empty">No source depiction.</p>';
  }
  if (src.dataUrl.startsWith(FIXTURE_SVG_PREFIX)) {
    try {
      const svg = decodeURIComponent(src.dataUrl.slice(FIXTURE_SVG_PREFIX.length));
      return svg;
    } catch {
      /* malformed encoding — fall through to <img> */
    }
  }
  return `<img src="${escapeHtml(src.dataUrl)}" alt="source diagram" />`;
}

// ── Footer ──────────────────────────────────────────────────────────────

function buildFooter(): HTMLElement {
  const footer = el("footer", "tw-footer");
  footer.id = "tw-footer";

  const row = el("div", "tw-footer-row");
  const form = el("form", "tw-nl-form") as HTMLFormElement;
  form.innerHTML = `
    <input id="tw-nl-input" type="text" autocomplete="off"
      placeholder='Tell the workbench what to change — e.g. "make the labels bigger"' />
    <button type="submit">Apply</button>
  `;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById(
      "tw-nl-input",
    ) as HTMLInputElement | null;
    if (!input) return;
    const utterance = input.value.trim();
    if (!utterance) return;
    void handleUtterance(utterance);
    input.value = "";
  });
  row.appendChild(form);

  const printBtn = el("button", "tw-export") as HTMLButtonElement;
  printBtn.type = "button";
  printBtn.textContent = "Print / export";
  printBtn.addEventListener("click", () => openPrintPreview());
  row.appendChild(printBtn);

  footer.appendChild(row);

  const status = el("div", "tw-edit-status");
  status.id = "tw-edit-status";
  footer.appendChild(status);
  return footer;
}

// ── Interactions ────────────────────────────────────────────────────────

async function handleUpload(file: File): Promise<void> {
  const dataUrl = await readDataUrl(file);
  const uf: UploadedFile = {
    name: file.name,
    mime: file.type || "image/png",
    dataUrl,
  };
  let asset = await nodes.ingest(uf);
  asset = { ...asset, status: "uploaded" };
  state.assets = [asset, ...state.assets];
  state.activeId = asset.id;
  state.lastEdit = null;
  parseError.delete(asset.id);
  sourceViews.delete(asset.id);
  rerender();

  // Live path (no fixtures): the VLM reads the uploaded structure → SMILES →
  // real ChemIR → braille compile. Fails honestly — an unreadable diagram or a
  // server with no API key surfaces as an error pane, never a stand-in molecule.
  try {
    // Lazy-load the real parse engine (pulls in rdkit WASM) so the homepage —
    // translator + example cards — never pays for it until someone uploads.
    const { realParse } = await import("../harness/real-parse");
    const ir = await realParse(asset);
    const tactile = await nodes.compile(ir);
    const idx = state.assets.findIndex((a) => a.id === asset.id);
    if (idx < 0) return;
    state.assets[idx] = {
      ...state.assets[idx],
      goldIR: ir,
      ir,
      tactile,
      status: "verified",
    };
  } catch (err) {
    const idx = state.assets.findIndex((a) => a.id === asset.id);
    if (idx < 0) return;
    parseError.set(
      asset.id,
      err instanceof Error ? err.message : "Couldn't read this diagram.",
    );
    state.assets[idx] = { ...state.assets[idx], status: "error" };
  }
  rerender();
}

function selectByName(name: string): void {
  const asset = state.assets.find((a) => a.name === name);
  if (!asset) return;
  state.activeId = asset.id;
  state.lastEdit = null;
  rerender();
}

function goHome(): void {
  state.activeId = null;
  state.lastEdit = null;
  rerender();
}

async function handleUtterance(utterance: string): Promise<void> {
  const asset = activeAsset();
  if (!asset) return;

  // Real NL understanding: hits the Claude-backed classifier and falls back to
  // the deterministic regex floor offline. Never throws. We show a loading
  // state while it resolves, then record where the op came from (llm/fallback).
  state.resolving = utterance;
  rerender();
  const { op, source, reason } = await resolveEditCommand(utterance);
  state.resolving = null;
  state.lastEdit = { utterance, op, source, reason };

  if (!op) {
    rerender();
    return;
  }
  if (op.kind === "export") {
    await downloadExport(asset, op.format);
    rerender();
    return;
  }
  const updated = await nodes.edit(op, asset);
  applySourceEdit(op, asset.id);
  const idx = state.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) state.assets[idx] = updated;
  rerender();
}

function openPrintPreview(): void {
  const asset = activeAsset();
  const sheet = asset?.tactile?.printSheet ?? asset?.tactile?.svg;
  if (!asset || !sheet) return;

  const overlay = el("div", "tw-print-overlay");
  const closeOverlay = (): void => {
    overlay.remove();
    document.body.classList.remove("tw-print-mode");
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  overlay.innerHTML = `
    <div class="tw-print-toolbar">
      <span>Emboss-ready sheet — ${escapeHtml(asset.name)}</span>
      <div class="tw-print-actions">
        <button type="button" class="tw-export" id="tw-print-now">Send to printer</button>
        <button type="button" class="tw-export" id="tw-print-svg">Download SVG</button>
        <button type="button" class="tw-export" id="tw-print-pdf">Download PDF</button>
        <button type="button" class="tw-export" id="tw-print-close">Close</button>
      </div>
    </div>
    <div class="tw-print-sheet">${sheet}</div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("tw-print-mode");

  overlay
    .querySelector("#tw-print-close")
    ?.addEventListener("click", closeOverlay);
  overlay
    .querySelector("#tw-print-now")
    ?.addEventListener("click", () => window.print());
  overlay.querySelector("#tw-print-svg")?.addEventListener("click", () => {
    void downloadExport(asset, "svg");
  });
  overlay.querySelector("#tw-print-pdf")?.addEventListener("click", () => {
    void downloadExport(asset, "pdf");
  });
}

async function downloadExport(
  asset: DiagramAsset,
  format: "svg" | "pdf",
): Promise<void> {
  if (!asset.tactile) return;
  const blob = await nodes.exportTactile(asset.tactile, format);
  downloadBlob(
    `${asset.name.replace(/\s+/g, "-").toLowerCase()}-tactile.${format}`,
    blob,
  );
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Render ──────────────────────────────────────────────────────────────

function activeAsset(): DiagramAsset | null {
  if (!state.activeId) return null;
  return state.assets.find((a) => a.id === state.activeId) ?? null;
}

function rerender(): void {
  renderMain();
  renderFooter();
}

function renderFooter(): void {
  const asset = activeAsset();
  const canEdit = Boolean(asset?.ir && asset?.tactile && asset.status !== "error");
  const footer = document.getElementById("tw-footer");
  // Hide edit/export controls while live upload parsing is pending or has
  // failed honestly. Otherwise an edit can route back through the fixture parser.
  if (footer) footer.style.display = canEdit ? "flex" : "none";
  const status = document.getElementById("tw-edit-status");
  if (!status) return;
  if (!canEdit) {
    status.textContent = "";
    status.removeAttribute("data-kind");
    return;
  }

  if (state.resolving) {
    status.setAttribute("data-kind", "resolving");
    status.textContent = `Resolving “${state.resolving}”…`;
    return;
  }
  if (!state.lastEdit) {
    status.textContent = "";
    status.removeAttribute("data-kind");
    return;
  }
  const { utterance, op, source, reason } = state.lastEdit;
  if (!op) {
    status.setAttribute("data-kind", "unmapped");
    status.textContent = `Couldn't map "${utterance}" to a safe edit. Try: bigger labels · thicken lines · emphasize double bond · space labels.`;
    return;
  }
  status.removeAttribute("data-kind");
  const label = reason ?? describeOp(op);
  // "rule match" (not "offline match"): the deterministic regex floor also runs
  // when the endpoint is reachable but the model declines/errs, not just offline.
  const prov =
    source === "llm" ? "via model" : source === "fallback" ? "rule match" : "";
  status.innerHTML =
    `<span class="tw-op">${escapeHtml(label)}</span> applied — “${escapeHtml(utterance)}”` +
    (prov ? ` <span class="tw-op-src">${escapeHtml(prov)}</span>` : "");
}

// ── DOM utils ───────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
