// Concept parse node: a typed chemistry concept ("aspirin") → SMILES (serverless
// LLM via /api/concept-to-smiles) → ChemIR (rdkit 2D depiction). The third input
// front door, alongside upload (real-parse.ts) and demo fixtures. It produces the
// SAME ChemIR the upload path does, so a typed concept rides the identical
// deterministic compile + verify path and lands as a fully `verified` tactile
// sheet — no draft, no preconfigure.
//
// Browser-only (the proxy call uses fetch); keep out of the node selftest bundle
// — it transitively pulls in smiles-to-ir's rdkit WASM import.

import type { ChemIR } from "./contracts";
import {
  conceptToSmilesViaProxy,
  type ConceptToSmilesProxyOptions,
} from "../api/concept-to-smiles";
import { smilesToIR } from "./smiles-to-ir";

/**
 * Turn a typed chemistry concept into a ChemIR via the live LLM proxy.
 * Throws if the concept names no single concrete molecule, surfacing the model's
 * warnings so the UI can show "couldn't turn this into a molecule" instead of a
 * silent empty diagram.
 */
export async function realConceptParse(
  concept: string,
  options: ConceptToSmilesProxyOptions = {},
): Promise<ChemIR> {
  const input = concept.trim();
  if (!input) throw new Error("concept: empty concept");

  const result = await conceptToSmilesViaProxy({ concept: input }, options);
  if (!result.smiles) {
    const why = result.warnings.length ? `: ${result.warnings.join("; ")}` : "";
    throw new Error(`concept: no molecule for "${input}"${why}`);
  }
  return smilesToIR(result.smiles);
}
