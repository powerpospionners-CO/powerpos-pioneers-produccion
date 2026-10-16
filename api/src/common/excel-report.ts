import { Workbook } from 'exceljs';
import { addNativeCharts } from './excel-charts';

type Cell = string | number | null;
export type ReportSheet = {
  name: string;
  headers: string[];
  rows: Cell[][];
  money?: number[];
  chart?: {
    title: string;
    label: number;
    value: number;
    limit?: number;
    type?: 'bar' | 'line' | 'pie';
    series?: { name: string; value: number }[];
  };
};

/** Read-only exports. Strings remain text, including user-entered formula prefixes. */
export async function excelReport(
  title: string,
  scope: string,
  sheets: ReportSheet[],
): Promise<Buffer> {
  const book = new Workbook();
  book.creator = 'PowerPOS';
  book.created = new Date();
  for (const spec of sheets) {
    const sheet = book.addWorksheet(spec.name, {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });
    const columns = Math.max(spec.headers.length, 2);
    sheet.mergeCells(1, 1, 1, columns);
    sheet.getCell('A1').value = `PowerPOS · ${title}`;
    sheet.getRow(1).height = 32;
    sheet.getCell('A1').font = {
      name: 'Calibri',
      size: 18,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF15324F' },
    };
    sheet.mergeCells(2, 1, 2, columns);
    sheet.getCell('A2').value = scope;
    sheet.getRow(2).height = 34;
    sheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
    sheet.mergeCells(3, 1, 3, columns);
    sheet.getCell('A3').value =
      `Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · Moneda: COP`;
    sheet.addRow([]);
    sheet.addRow(spec.headers);
    sheet.getRow(5).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF167D9A' },
      };
      cell.alignment = { wrapText: true, vertical: 'middle' };
    });
    sheet.getRow(5).height = 30;
    for (const values of spec.rows) {
      const row = sheet.addRow(
        values.map((v) =>
          typeof v === 'number' && !Number.isFinite(v) ? null : v,
        ),
      );
      row.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11 };
        if (row.number % 2 === 0)
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F6FA' },
          };
      });
      for (const col of spec.money || [])
        row.getCell(col + 1).numFmt = '"$" #,##0.00;[Red]-"$" #,##0.00';
    }
    spec.headers.forEach((header, i) => {
      sheet.getColumn(i + 1).width = Math.min(
        48,
        Math.max(
          18,
          header.length + 3,
          ...spec.rows
            .slice(0, 200)
            .map((row) =>
              typeof row[i] === 'string'
                ? Math.min(48, String(row[i]).length + 2)
                : 18,
            ),
        ),
      );
    });
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, sheet.rowCount), column: spec.headers.length },
    };
    sheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:5',
    };
    if (!spec.rows.length)
      sheet.getCell('A6').value = 'Sin datos para este periodo.';
  }
  return addNativeCharts(Buffer.from(await book.xlsx.writeBuffer()), sheets);
}
