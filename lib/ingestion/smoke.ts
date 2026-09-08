import { parseFdxScreenplay } from "@/lib/ingestion/fdx";
import { parsePdfScreenplay } from "@/lib/ingestion/pdf";

type ParserSmokeResult = {
  format: "fdx" | "pdf";
  sceneCount: number;
  blockCount: number;
  warningCodes: string[];
  elapsedMs: number;
};

export type IngestionSmokeResult = {
  fdx: ParserSmokeResult;
  pdf: ParserSmokeResult;
  totalElapsedMs: number;
};

const smokeFdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script">
  <Content>
    <Paragraph Type="Scene Heading"><Text>1. INT. GREENHOUSE - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text>MARA checks the seedlings.</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>2A. EXT. GREENHOUSE - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>A delivery van stops at the gate.</Text></Paragraph>
  </Content>
</FinalDraft>`;

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

function createSmokePdf(): Uint8Array {
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    `(${escapePdfText("1. INT. GREENHOUSE - DAY")}) Tj`,
    "0 -18 Td",
    `(${escapePdfText("MARA checks the seedlings.")}) Tj`,
    "0 -18 Td",
    `(${escapePdfText("2A. EXT. GREENHOUSE - NIGHT")}) Tj`,
    "0 -18 Td",
    `(${escapePdfText("A delivery van stops at the gate.")}) Tj`,
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "ascii"));
}

function resultFor(
  format: ParserSmokeResult["format"],
  startedAt: number,
  screenplay: { blocks: unknown[]; scenes: unknown[]; warnings: Array<{ code: string }> },
): ParserSmokeResult {
  return {
    format,
    sceneCount: screenplay.scenes.length,
    blockCount: screenplay.blocks.length,
    warningCodes: screenplay.warnings.map((warning) => warning.code),
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
  };
}

/** Runs only repository-owned synthetic screenplay inputs and returns no source text. */
export async function runIngestionSmoke(): Promise<IngestionSmokeResult> {
  const totalStartedAt = performance.now();
  const fdxStartedAt = performance.now();
  const fdx = resultFor(
    "fdx",
    fdxStartedAt,
    parseFdxScreenplay(new TextEncoder().encode(smokeFdx)),
  );
  const pdfStartedAt = performance.now();
  const pdf = resultFor("pdf", pdfStartedAt, await parsePdfScreenplay(createSmokePdf()));

  return {
    fdx,
    pdf,
    totalElapsedMs: Math.round((performance.now() - totalStartedAt) * 10) / 10,
  };
}
