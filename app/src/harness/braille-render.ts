// Font-independent braille-dot renderer.
// A unicode glyph like ⠉ is NOT emboss-safe: different fonts/PDF/print paths
// may not turn it into stable tactile dots. So we decode each grade-1 cell to
// its raised-dot set and draw the dots as explicit SVG circles at a fixed
// cell/dot geometry. The same primitive drives the workbench preview and the
// emboss-ready print sheet — one source of truth, no font dependency.

import { toBraille } from "./braille";

// Standard 6-dot cell layout: dots 1,2,3 fill the left column (top→bottom),
// dots 4,5,6 the right column.
const DOT_POS: Record<number, [col: number, row: number]> = {
  1: [0, 0],
  2: [0, 1],
  3: [0, 2],
  4: [1, 0],
  5: [1, 1],
  6: [1, 2],
};

export type BrailleStyle = {
  dotPitch: number; // center-to-center between adjacent dots within a cell
  cellAdvance: number; // col0-of-cell → col0-of-next-cell
  dotRadius: number;
  showFlat: boolean; // draw un-raised dots as hollow guides (PREVIEW ONLY)
  raisedFill: string;
  flatStroke: string;
};

// BANA-proportioned geometry in millimetres for the emboss-ready print sheet.
export const PRINT_BRAILLE_MM: BrailleStyle = {
  dotPitch: 2.5,
  cellAdvance: 6.0,
  dotRadius: 0.75,
  showFlat: false, // raised dots only — a hollow ring can emboss as tactile noise
  raisedFill: "#000",
  flatStroke: "#bbb",
};

// Decode a single braille glyph to the list of raised dot numbers (1..6).
export function cellRaisedDots(glyph: string): number[] {
  const code = (glyph.codePointAt(0) ?? 0x2800) - 0x2800;
  if (code < 0 || code > 0xff) return [];
  const dots: number[] = [];
  for (let n = 1; n <= 6; n++) if ((code >> (n - 1)) & 1) dots.push(n);
  return dots;
}

// Total width (across dot centers) of a rendered label, for centering.
export function brailleLabelWidth(text: string, style: BrailleStyle): number {
  const n = [...toBraille(text)].length;
  return n === 0 ? 0 : (n - 1) * style.cellAdvance + style.dotPitch;
}

// Render a label with its top-left dot center at (x, y).
export function brailleLabelSVG(
  text: string,
  x: number,
  y: number,
  style: BrailleStyle,
): string {
  let out = "";
  [...toBraille(text)].forEach((glyph, ci) => {
    const baseX = x + ci * style.cellAdvance;
    const raised = new Set(cellRaisedDots(glyph));
    for (let dot = 1; dot <= 6; dot++) {
      const [col, row] = DOT_POS[dot];
      const cx = (baseX + col * style.dotPitch).toFixed(2);
      const cy = (y + row * style.dotPitch).toFixed(2);
      if (raised.has(dot)) {
        out += `<circle cx="${cx}" cy="${cy}" r="${style.dotRadius.toFixed(2)}" fill="${style.raisedFill}"/>`;
      } else if (style.showFlat) {
        out += `<circle cx="${cx}" cy="${cy}" r="${(style.dotRadius * 0.55).toFixed(2)}" fill="none" stroke="${style.flatStroke}" stroke-width="0.4"/>`;
      }
    }
  });
  return out;
}

// Render a label centered at (cx, cy).
export function brailleLabelCentered(
  text: string,
  cx: number,
  cy: number,
  style: BrailleStyle,
): string {
  const w = brailleLabelWidth(text, style);
  return brailleLabelSVG(text, cx - w / 2, cy - style.dotPitch, style);
}
