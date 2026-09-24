import ExcelJS from "exceljs";
import type { MeetingReport } from "@/lib/reports";
import { MEETING_TOPIC_CATEGORIES, meetingCategoryLabel, topicResponsibleLabel } from "@/lib/meetings";

/**
 * Ata de reunião em Excel no padrão da MRS — as mesmas duas folhas do PDF
 * "modelo do cliente" (Lista de Presença / Ata de Reunião), com as cores do
 * formulário original: barra teal (#006666), seções em cinza (#767171),
 * título do item em teal e status como círculo (○ aberto, ● concluído).
 * Editável: o cliente costuma continuar a ata no próprio Excel.
 */

const TEAL = "FF006666";
const SECTION_GRAY = "FF767171";
const GRID = "FFA6A6A6";
const WHITE = "FFFFFFFF";

const thin = { style: "thin" as const, color: { argb: GRID } };
const border: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Aplica borda (e opcionalmente estilo) a todas as células de um intervalo de linha. */
function styleRow(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number, extra?: Partial<ExcelJS.Style>) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getCell(row, c);
    cell.border = border;
    if (extra) Object.assign(cell, extra);
  }
}

function titleRow(ws: ExcelJS.Worksheet, row: number, lastCol: number, text: string) {
  ws.mergeCells(row, 1, row, lastCol);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  styleRow(ws, row, 1, lastCol);
  ws.getRow(row).height = 24;
}

/** Bloco Doc.Nº / Resp. / Tipo | Projeto / Local | Data + barra "Ata de Reunião e Lista De Ações". */
function identification(
  ws: ExcelJS.Worksheet,
  row: number,
  spans: [number, number][],
  lastCol: number,
  report: MeetingReport,
) {
  const h = report.header;
  const texts = [
    `Doc.Nº.: ${h.number ?? "-"}\nResp.: ${h.preparedBy || "-"}\nTipo de Reunião: ${h.title || "-"}`,
    `Projeto: ${h.projectName}\nLocal: ${h.location || "-"}`,
    `Data: ${fmtDate(h.date)}${h.startTime ? `\n${h.startTime}` : ""}`,
  ];
  spans.forEach(([from, to], i) => {
    if (to > from) ws.mergeCells(row, from, row, to);
    const cell = ws.getCell(row, from);
    cell.value = texts[i];
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.font = { size: 9 };
  });
  styleRow(ws, row, 1, lastCol);
  ws.getRow(row).height = 46;

  ws.mergeCells(row + 1, 1, row + 1, lastCol);
  const bar = ws.getCell(row + 1, 1);
  bar.value = "Ata de Reunião e Lista De Ações";
  styleRow(ws, row + 1, 1, lastCol, {
    fill: fill(TEAL),
    font: { bold: true, color: { argb: WHITE } },
    alignment: { horizontal: "center", vertical: "middle" },
  });
}

function pageSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
}

function presenceSheet(wb: ExcelJS.Workbook, report: MeetingReport) {
  const ws = wb.addWorksheet("Lista de Presença");
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 34 }, { width: 22 }];
  pageSetup(ws);

  titleRow(ws, 1, 4, "LISTA DE PRESENÇA");
  identification(ws, 2, [[1, 1], [2, 3], [4, 4]], 4, report);

  ws.mergeCells(4, 1, 4, 4);
  ws.getCell(4, 1).value = "Participantes";
  styleRow(ws, 4, 1, 4, { fill: fill(TEAL), font: { bold: true, color: { argb: WHITE } } });

  const header = ["Nome", "Empresa", "E-mail", "Modo"];
  header.forEach((t, i) => (ws.getCell(5, i + 1).value = t));
  styleRow(ws, 5, 1, 4, { font: { bold: true, size: 9 }, alignment: { horizontal: "center" } });

  let r = 6;
  const minRows = Math.max(8, report.participants.length);
  for (let i = 0; i < minRows; i++, r++) {
    const p = report.participants[i];
    if (p) {
      ws.getCell(r, 1).value = p.name;
      ws.getCell(r, 2).value = p.company ?? "";
      ws.getCell(r, 3).value = p.email ?? "";
      ws.getCell(r, 4).value = p.mode ?? "";
    }
    styleRow(ws, r, 1, 4, { font: { size: 9 }, alignment: { vertical: "middle" } });
  }

  if (report.header.subject) {
    r++;
    ws.mergeCells(r, 1, r, 4);
    ws.getCell(r, 1).value = "Pauta";
    styleRow(ws, r, 1, 4, { fill: fill(TEAL), font: { bold: true, color: { argb: WHITE } } });
    r++;
    ws.mergeCells(r, 1, r, 4);
    ws.getCell(r, 1).value = report.header.subject;
    styleRow(ws, r, 1, 4, { font: { size: 9 }, alignment: { wrapText: true, vertical: "top" } });
  }
}

function ataSheet(wb: ExcelJS.Workbook, report: MeetingReport) {
  const ws = wb.addWorksheet("Ata de Reunião");
  // Item | Descrição | Responsável | Data | Sts
  ws.columns = [{ width: 7 }, { width: 80 }, { width: 20 }, { width: 12 }, { width: 6 }];
  pageSetup(ws);

  titleRow(ws, 1, 5, "ATA DE REUNIÃO");
  identification(ws, 2, [[1, 2], [3, 3], [4, 5]], 5, report);

  const header = ["Item", "Descrição", "Responsável", "Data", "Sts"];
  header.forEach((t, i) => (ws.getCell(4, i + 1).value = t));
  styleRow(ws, 4, 1, 5, {
    fill: fill(TEAL),
    font: { bold: true, color: { argb: WHITE }, size: 9 },
    alignment: { horizontal: "center", vertical: "middle" },
  });
  ws.getCell(4, 2).alignment = { horizontal: "left", vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 4 }];

  let r = 5;
  MEETING_TOPIC_CATEGORIES.forEach((cat, catIndex) => {
    const n = catIndex + 1;
    ws.getCell(r, 1).value = n;
    ws.mergeCells(r, 2, r, 5);
    ws.getCell(r, 2).value = meetingCategoryLabel(cat);
    styleRow(ws, r, 1, 5, {
      fill: fill(SECTION_GRAY),
      font: { bold: true, color: { argb: WHITE }, size: 9 },
      alignment: { vertical: "middle" },
    });
    ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };
    r++;

    const items = report.topicGroups.find((g) => g.category === cat)?.items ?? [];
    items.forEach((t, i) => {
      ws.getCell(r, 1).value = `${n}.${i + 1}`;

      // Descrição em rich text: título (teal, negrito) + data em negrito + texto.
      const parts: ExcelJS.RichText[] = [];
      if (t.title) parts.push({ text: `${t.title}\n`, font: { bold: true, size: 9, color: { argb: TEAL } } });
      if (t.date) parts.push({ text: `${fmtDate(t.date)}: `, font: { bold: true, size: 9 } });
      parts.push({ text: t.description, font: { size: 9 } });
      ws.getCell(r, 2).value = { richText: parts };

      ws.getCell(r, 3).value = topicResponsibleLabel(t);
      ws.getCell(r, 4).value = t.dueDate ? fmtDate(t.dueDate) : "";
      const st = t.status.toUpperCase();
      ws.getCell(r, 5).value = st.startsWith("CONCLU") ? "●" : st === "CANCELADO" ? "✕" : "○";

      styleRow(ws, r, 1, 5, { font: { size: 9 }, alignment: { vertical: "middle", horizontal: "center" } });
      ws.getCell(r, 2).alignment = { vertical: "middle", horizontal: "justify", wrapText: true };
      ws.getCell(r, 3).font = { bold: true, size: 9 };
      ws.getCell(r, 3).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      ws.getCell(r, 5).font = { size: 12 };

      // Altura aproximada pela quantidade de linhas do texto (Excel não
      // ajusta sozinho célula com quebra de linha gerada por biblioteca).
      const chars = (t.title?.length ?? 0) + t.description.length + 12;
      const lines = Math.max(1, Math.ceil(chars / 95)) + (t.title ? 1 : 0);
      ws.getRow(r).height = Math.max(18, lines * 13);
      r++;
    });
  });

  if (report.header.diverseSubjects) {
    r++;
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = "Assuntos diversos";
    styleRow(ws, r, 1, 5, { fill: fill(TEAL), font: { bold: true, color: { argb: WHITE } } });
    r++;
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = report.header.diverseSubjects;
    styleRow(ws, r, 1, 5, { font: { size: 9 }, alignment: { wrapText: true, vertical: "top" } });
  }
}

export async function buildMeetingXlsx(report: MeetingReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DataPulse";
  wb.created = report.generatedAt;
  presenceSheet(wb, report);
  ataSheet(wb, report);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
