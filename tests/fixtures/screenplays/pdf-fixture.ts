function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

function pageContent(lines: string[]): string {
  const commands = ["BT", "/F1 12 Tf", "72 720 Td"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -18 Td");
    commands.push(`(${escapePdfText(line)}) Tj`);
  });
  commands.push("ET");
  return commands.join("\n");
}

export function createPdfWithPageLines(pageLines: string[][]): Uint8Array {
  const pageContents = pageLines.map(pageContent);
  const pageObjectIds = pageContents.map((_, index) => 3 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`,
  ];
  pageContents.forEach((content, index) => {
    const pageId = pageObjectIds[index]!;
    const contentId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pageContents.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );
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

export function createTextScreenplayPdf(): Uint8Array {
  return createPdfWithPageLines([
    [
      "1. INT. GREENHOUSE - DAY",
      "Condensation gathers on the glass.",
      "MARA checks the seedlings.",
    ],
    ["2A. EXT. GREENHOUSE - NIGHT", "A delivery van stops at the gate."],
  ]);
}

export function createBlankPdf(): Uint8Array {
  return createPdfWithPageLines([[]]);
}
