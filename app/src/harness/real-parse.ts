// Real parse node: a photographed / drawn structure → SMILES (serverless VLM
// via /api/extract-smiles) → ChemIR (rdkit 2D depiction). This is the LIVE,
// non-preconfigured path — no fixture lookup. Drop it in for HarnessNodes.parse
// when the asset is a genuine upload rather than a demo fixture.
//
// Browser-only (the proxy call uses fetch); keep out of the node selftest
// bundle — it transitively pulls in smiles-to-ir's rdkit WASM import.

import type { ChemIR, DiagramAsset } from "./contracts";
import {
  extractSmilesViaProxy,
  type ExtractSmilesProxyOptions,
  type ExtractSmilesRequest,
} from "../api/extract-smiles";
import { smilesToIR } from "./smiles-to-ir";

// SVG sources are text the VLM reads directly; raster sources go as image data.
function requestForAsset(asset: DiagramAsset): ExtractSmilesRequest {
  const { mime, dataUrl, name } = asset.source;
  if (mime === "image/svg+xml") {
    return { svgText: dataUrlToText(dataUrl), fileName: name };
  }
  return { imageDataUrl: dataUrl, mediaType: mime, fileName: name };
}

function dataUrlToText(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl;
  const data = dataUrl.slice(comma + 1);
  return dataUrl.slice(0, comma).includes(";base64")
    ? atob(data)
    : decodeURIComponent(data);
}

/**
 * Parse an uploaded chemistry diagram into a ChemIR via the live VLM proxy.
 * Throws if the model recognizes no structure, surfacing any model warnings so
 * the UI can show "couldn't read this" instead of a silent empty diagram.
 */
export async function realParse(
  asset: DiagramAsset,
  options: ExtractSmilesProxyOptions = {},
): Promise<ChemIR> {
  const result = await extractSmilesViaProxy(requestForAsset(asset), options);
  if (!result.smiles) {
    const why = result.warnings.length ? `: ${result.warnings.join("; ")}` : "";
    throw new Error(`parse: no chemical structure recognized${why}`);
  }
  return smilesToIR(result.smiles);
}
