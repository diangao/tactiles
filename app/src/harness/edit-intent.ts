// Deterministic natural-language → EditOp router.
// Teachers type free text; we match it to ONE fixed, safe operation. This is
// the layer a model could later replace for fuzzier phrasing, but the default
// is rule-based so the demo never depends on a live model call.

import type { EditOp } from "./contracts";
import { ANNOTATION_MAX_CHARS } from "./contracts";

type Rule = { test: RegExp; build: (text: string) => EditOp | null };

function readRotation(text: string): 90 | 180 | -90 {
  const m = text.match(/(-?\d{2,3})\s*(?:°|deg|degree)/i);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v === 90 || v === 180 || v === -90 || v === 270) {
      return v === 270 ? -90 : (v as 90 | 180 | -90);
    }
  }
  if (/\bupside[\s-]?down|180\b|flip\b/i.test(text)) return 180;
  if (/\bcounter[\s-]?clock|\bccw\b|\bleft\b/i.test(text)) return -90;
  return 90;
}

function readMoveElement(text: string): string | null {
  // "the oxygen label", "the nitrogen", "the H label"
  const named = text.match(
    /\b(oxygen|nitrogen|carbon|sulfur|phosphor(?:us)?|fluor(?:ine)?|chlor(?:ine)?|brom(?:ine)?|iod(?:ine)?|hydrogen)\b/i,
  );
  if (named) {
    const map: Record<string, string> = {
      oxygen: "O",
      nitrogen: "N",
      carbon: "C",
      sulfur: "S",
      phosphor: "P",
      phosphorus: "P",
      fluor: "F",
      fluorine: "F",
      chlor: "Cl",
      chlorine: "Cl",
      brom: "Br",
      bromine: "Br",
      iod: "I",
      iodine: "I",
      hydrogen: "H",
    };
    return map[named[1].toLowerCase()] ?? null;
  }
  const sym = text.match(/\bthe\s+([A-Z][a-z]?)\b/);
  if (sym && /^(C|H|O|N|S|P|F|Cl|Br|I)$/.test(sym[1])) return sym[1];
  return null;
}

function readMoveDirection(text: string): "out" | "up" | "down" {
  if (/\bup(ward|wards)?\b|\bhigher\b|\babove\b/i.test(text)) return "up";
  if (/\bdown(ward|wards)?\b|\blower\b|\bbelow\b/i.test(text)) return "down";
  return "out";
}

function readAnnotationText(text: string): string | null {
  // Quoted text wins: "add a note: 'watch the carbonyl'"
  const quoted = text.match(/[“"']([^“”"']{1,200})[”"']/);
  if (quoted) return quoted[1].trim().slice(0, ANNOTATION_MAX_CHARS);
  // Or content after "note:" / "annotation:" / "label:" / "caption:"
  const colon = text.match(/\b(?:note|annotation|caption|legend)\s*[:\-—]\s*(.+)$/i);
  if (colon) return colon[1].trim().slice(0, ANNOTATION_MAX_CHARS);
  return null;
}

const RULES: Rule[] = [
  {
    test: /\b(label|text|atom)s?\b.*\b(big|bigger|larger|enlarge|grow)\b|\b(big|bigger|larger|enlarge)\b.*\blabel/i,
    build: () => ({ kind: "enlargeLabels" }),
  },
  {
    test: /thick|bolder|heavier|stronger\s+line|bold\s+line/i,
    build: () => ({ kind: "thickenLines" }),
  },
  {
    test: /\bdouble bond/i,
    build: () => ({ kind: "emphasizeDoubleBonds" }),
  },
  {
    test: /\b(rotate|turn|spin|flip)\b/i,
    build: (text) => ({ kind: "rotateDiagram", degrees: readRotation(text) }),
  },
  {
    test: /\b(move|push|shift|nudge)\b.*\blabel|\blabel.*\b(away|farther|further)\s+(from|away)\b/i,
    build: (text) => {
      const element = readMoveElement(text);
      if (!element) return null;
      return { kind: "moveLabel", element, direction: readMoveDirection(text) };
    },
  },
  {
    test: /\b(add|put|include|attach)\b.*\b(note|annotation|caption|legend|notation)\b/i,
    build: (text) => {
      const t = readAnnotationText(text);
      if (!t) return null;
      return { kind: "addAnnotation", text: t };
    },
  },
  {
    test: /\b(space|spread|apart|farther|further|separate)\b.*\blabel|\blabel.*\b(space|spread|apart)/i,
    build: () => ({ kind: "spaceLabels" }),
  },
  {
    test: /\b(remove|hide|strip|clear)\b.*\b(background|backdrop|detail)/i,
    build: () => ({ kind: "removeBackground" }),
  },
  {
    test: /\bexport\b.*\bpdf\b|\bpdf\b/i,
    build: () => ({ kind: "export", format: "pdf" }),
  },
  {
    test: /\bexport\b|\bdownload\b.*\bsvg\b|\bsvg\b/i,
    build: () => ({ kind: "export", format: "svg" }),
  },
];

export function parseEditCommand(text: string): EditOp | null {
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.build(text);
  }
  return null;
}
