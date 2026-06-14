import type { DiagramAsset, DiagramKind, TactileSVG } from "./contracts";
import { toBraille } from "./braille";
import { brailleLabelSVG, PRINT_BRAILLE_MM } from "./braille-render";
import {
  compositeTactileSheet,
  type TactileLabel,
  type TactileLabelExtraction,
  type TactileSubject,
} from "./passthrough";

export type RoutedSubject = {
  kind: DiagramKind;
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

const SUBJECTS: Array<{
  kind: DiagramKind;
  label: string;
  terms: string[];
}> = [
  {
    kind: "chemistry",
    label: "Chemistry molecule",
    terms: [
      "chemistry",
      "molecule",
      "benzene",
      "carbonyl",
      "acetone",
      "acetic",
      "ethanol",
      "methanol",
      "caffeine",
      "lactic",
      "bond",
      "smiles",
      "alkene",
      "acid",
      "ring",
    ],
  },
  {
    kind: "circuit",
    label: "Circuit",
    terms: ["circuit", "resistor", "battery", "led", "bulb", "switch", "parallel", "series"],
  },
  {
    kind: "biology",
    label: "Biology diagram",
    terms: ["biology", "cell", "neuron", "synapse", "mitosis", "membrane", "nucleus", "plant"],
  },
  {
    kind: "map",
    label: "Map / geography",
    terms: ["geography", "map", "river", "delta", "water-cycle", "water cycle", "route", "boundary"],
  },
  {
    kind: "physics",
    label: "Physics force diagram",
    terms: ["physics", "force", "incline", "inclined", "slope", "theta", "friction", "free-body"],
  },
  {
    kind: "graph",
    label: "Math graph",
    terms: ["math", "graph", "quadratic", "parabola", "function", "axis", "unit-circle", "unit circle"],
  },
  {
    kind: "geometry",
    label: "Geometry",
    terms: ["geometry", "triangle", "circle", "tangent", "radius", "angle", "pythagorean"],
  },
];

export function routeSubject(asset: DiagramAsset): RoutedSubject {
  const haystack = `${asset.name} ${asset.source.name}`.toLowerCase();
  const normalizedHaystack = normalizeTerms(haystack);
  for (const subject of SUBJECTS) {
    const matched = subject.terms.find((term) =>
      termMatches(normalizedHaystack, term),
    );
    if (matched) {
      return {
        kind: subject.kind,
        label: subject.label,
        confidence: subject.kind === "chemistry" ? "high" : "medium",
        reason: `matched "${matched}" in the file name`,
      };
    }
  }
  return {
    kind: "unknown",
    label: "Tactile diagram",
    confidence: "low",
    reason: "no subject keyword matched",
  };
}

const DRAFT_META: { title: string; features: string[] } = {
  title: "Tactile draft",
  features: ["major lines", "labels", "legend"],
};

export function buildDraftTactile(asset: DiagramAsset, route: RoutedSubject): TactileSVG {
  const kind =
    route.kind === "chemistry" ? ("unknown" as const) : route.kind;
  const meta = DRAFT_META;
  const sourceSvg = sourceSvgText(asset);
  const extraction = sourceSvg
    ? svgLabelExtraction(sourceSvg, kind, meta.title)
    : null;
  const passthrough = sourceSvg && extraction && extraction.labels.length > 0
    ? compositeTactileSheet(
      {
        ...asset.source,
        dataUrl: svgToDataUrl(sourceSvg),
      },
      extraction,
    )
    : null;
  const printPassthrough = sourceSvg && extraction && extraction.labels.length > 0
    ? compositeTactileSheet(
      {
        ...asset.source,
        dataUrl: svgToDataUrl(sourceSvg),
      },
      extraction,
      { width: 210, height: 297 },
    )
    : null;
  const svg = passthrough ?? draftSvg(meta.title, route.label, meta.features, false);
  const printSheet = printPassthrough ?? draftSvg(meta.title, route.label, meta.features, true);
  const braille = extraction?.labels.length
    ? extraction.labels.map((label, idx) => ({
      atomIdx: idx,
      cells: toBraille(label.text),
    }))
    : meta.features.map((feature, idx) => ({
      atomIdx: idx,
      cells: toBraille(feature),
    }));
  return {
    svg,
    draftKind: route.kind,
    ir: { smiles: "", atoms: [], bonds: [] },
    braille,
    printSheet,
  };
}

function normalizeTerms(input: string): string {
  return ` ${input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function termMatches(normalizedHaystack: string, term: string): boolean {
  const normalizedTerm = normalizeTerms(term).trim();
  return normalizedTerm.length > 0 && normalizedHaystack.includes(` ${normalizedTerm} `);
}

function svgLabelExtraction(
  sourceSvg: string,
  kind: Exclude<DiagramKind, "chemistry">,
  title: string,
): TactileLabelExtraction {
  const viewBox = readViewBox(sourceSvg);
  const labels: TactileLabel[] = [];
  sourceSvg.replace(
    /<text\b([^>]*)>([\s\S]*?)<\/text>/gi,
    (_match, attrs: string, raw: string) => {
      const text = raw.replace(/<[^>]+>/g, "").trim();
      if (!text) return "";
      const x = readAttr(attrs, "x");
      const y = readAttr(attrs, "y");
      if (x === null || y === null) return "";
      labels.push({
        text,
        x: clamp01((x - viewBox.x) / viewBox.width),
        y: clamp01((y - viewBox.y) / viewBox.height),
        fontSize: clamp((readAttr(attrs, "font-size") ?? 18) / viewBox.height, 0.01, 0.2),
      });
      return "";
    },
  );
  return {
    subject: passthroughSubject(kind),
    title,
    labels,
  };
}

function passthroughSubject(kind: Exclude<DiagramKind, "chemistry">): TactileSubject {
  if (kind === "biology") return "biology";
  if (kind === "physics") return "physics";
  if (kind === "graph" || kind === "geometry") return "math";
  if (kind === "map") return "geography";
  return "other";
}

function readViewBox(svg: string): { x: number; y: number; width: number; height: number } {
  const tag = svg.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const rawViewBox = tag.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  if (rawViewBox) {
    const parts = rawViewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = readAttr(tag, "width") ?? 1024;
  const height = readAttr(tag, "height") ?? 768;
  return { x: 0, y: 0, width, height };
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function sourceSvgText(asset: DiagramAsset): string | null {
  if (asset.source.mime !== "image/svg+xml") return null;
  const dataUrl = asset.source.dataUrl;
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return sanitizeSvg(dataUrl);
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  try {
    return sanitizeSvg(
      meta.includes(";base64") ? atob(body) : decodeURIComponent(body),
    );
  } catch {
    return null;
  }
}

function readAttr(attrs: string, name: string): number | null {
  const m = attrs.match(new RegExp(`\\b${name}=["']?(-?\\d+(?:\\.\\d+)?)`, "i"));
  return m ? Number(m[1]) : null;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
}

function draftSvg(
  title: string,
  label: string,
  features: string[],
  printSheet: boolean,
): string {
  const width = printSheet ? 210 : 520;
  const height = printSheet ? 297 : 360;
  const brailleStyle = printSheet ? PRINT_BRAILLE_MM : {
    ...PRINT_BRAILLE_MM,
    dotPitch: 3.2,
    cellAdvance: 7.2,
    dotRadius: 0.9,
  };
  const key = features
    .map((feature, idx) => {
      const y = printSheet ? 248 + idx * 10 : 272 + idx * 24;
      const x = printSheet ? 22 : 54;
      const dots = brailleLabelSVG(feature, x + (printSheet ? 24 : 92), y - 2, brailleStyle);
      return (
        `<text x="${x}" y="${y}" font-size="${printSheet ? 4 : 13}" font-family="monospace" fill="#000">${escapeXml(feature)}</text>` +
        dots
      );
    })
    .join("");
  const body = printSheet
    ? `<g transform="translate(24 52)">
        <path d="M0 82 H132 M18 34 H110 M18 34 L68 2 L132 82" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M58 44 C78 34 94 42 108 56" fill="none" stroke="#000" stroke-width="0.9" stroke-linecap="round"/>
        <circle cx="48" cy="50" r="4" fill="#000"/>
        <circle cx="82" cy="45" r="4" fill="#000"/>
        <path d="M38 118 H102" stroke="#000" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="2 2"/>
      </g>`
    : `<g transform="translate(68 70)">
        <path d="M0 170 H360 M46 82 H286 M46 82 L180 0 L360 170" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M160 102 C204 72 250 82 296 124" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>
        <circle cx="132" cy="120" r="12" fill="#000"/>
        <circle cx="218" cy="106" r="12" fill="#000"/>
        <path d="M96 250 H266" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-dasharray="11 11"/>
      </g>`;
  const titleText = printSheet
    ? `<text x="18" y="22" font-size="5" font-family="monospace" font-weight="700" fill="#000">${escapeXml(title)}</text>
       <text x="18" y="31" font-size="3.2" font-family="monospace" fill="#555">${escapeXml(label)} · teacher review draft</text>`
    : `<text x="26" y="34" font-size="20" font-family="system-ui, sans-serif" font-weight="700" fill="#000">${escapeXml(title)}</text>
       <text x="26" y="58" font-size="13" font-family="system-ui, sans-serif" fill="#555">${escapeXml(label)} · teacher review draft</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}${printSheet ? "mm" : ""}" height="${height}${printSheet ? "mm" : ""}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">` +
    `<rect width="${width}" height="${height}" fill="#fff"/>${titleText}${body}${key}</svg>`
  );
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
