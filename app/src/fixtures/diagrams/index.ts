// Inlined source-diagram SVGs as plain TS strings so both the Vite dev/build
// path AND the esbuild-bundled selftest can consume them without configuring
// a separate `?raw` loader. Hand-drawn skeletal formulas — the same artwork
// shipped in PR #11 (./*.svg), kept here for the source pane of the workbench.

export const ETHANOL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 120" width="260" height="120">
  <!-- ethanol: CH3-CH2-OH, drawn as a zigzag skeletal formula -->
  <rect width="260" height="120" fill="white"/>
  <line x1="30" y1="80" x2="80" y2="40" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="80" y1="40" x2="130" y2="80" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="130" y1="80" x2="180" y2="40" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <text x="178" y="34" font-family="serif" font-size="22" text-anchor="middle">OH</text>
  <text x="130" y="105" font-family="serif" font-size="13" text-anchor="middle" fill="#666">ethanol</text>
</svg>`;

export const ACETONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 140" width="260" height="140">
  <!-- acetone: (CH3)2C=O, central carbon with double bond to oxygen + two methyls -->
  <rect width="260" height="140" fill="white"/>
  <line x1="40" y1="100" x2="100" y2="60" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="100" y1="60" x2="160" y2="100" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <!-- C=O double bond: two parallel vertical strokes -->
  <line x1="96" y1="56" x2="96" y2="22" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="104" y1="56" x2="104" y2="22" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <text x="100" y="16" font-family="serif" font-size="22" text-anchor="middle">O</text>
  <text x="130" y="125" font-family="serif" font-size="13" text-anchor="middle" fill="#666">acetone</text>
</svg>`;

export const ACETIC_ACID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 140" width="280" height="140">
  <!-- acetic acid: CH3-C(=O)-OH, methyl + carboxyl with C=O double bond and C-OH -->
  <rect width="280" height="140" fill="white"/>
  <!-- CH3 — C zigzag -->
  <line x1="40" y1="100" x2="100" y2="60" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <!-- central C — carboxyl carbon (left bond from methyl) -->
  <!-- C=O double bond going up: two parallel vertical strokes -->
  <line x1="96" y1="56" x2="96" y2="22" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="104" y1="56" x2="104" y2="22" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <text x="100" y="16" font-family="serif" font-size="22" text-anchor="middle">O</text>
  <!-- C — OH single bond going right -->
  <line x1="100" y1="60" x2="170" y2="60" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <text x="195" y="68" font-family="serif" font-size="22" text-anchor="middle">OH</text>
  <text x="140" y="125" font-family="serif" font-size="13" text-anchor="middle" fill="#666">acetic acid</text>
</svg>`;

export const ETHYLENE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 120" width="260" height="120">
  <!-- ethylene: H2C=CH2, two carbons with double bond, drawn as parallel lines + explicit hydrogens -->
  <rect width="260" height="120" fill="white"/>
  <!-- C=C double bond -->
  <line x1="90" y1="56" x2="170" y2="56" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="90" y1="68" x2="170" y2="68" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <!-- explicit Hs to make the C=C unmistakable -->
  <line x1="90" y1="62" x2="60" y2="32" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="90" y1="62" x2="60" y2="92" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="170" y1="62" x2="200" y2="32" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="170" y1="62" x2="200" y2="92" stroke="black" stroke-width="2.4" stroke-linecap="round"/>
  <text x="55" y="28" font-family="serif" font-size="20" text-anchor="middle">H</text>
  <text x="55" y="100" font-family="serif" font-size="20" text-anchor="middle">H</text>
  <text x="205" y="28" font-family="serif" font-size="20" text-anchor="middle">H</text>
  <text x="205" y="100" font-family="serif" font-size="20" text-anchor="middle">H</text>
  <text x="130" y="115" font-family="serif" font-size="13" text-anchor="middle" fill="#666">ethylene</text>
</svg>`;
