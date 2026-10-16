import { Workbook } from 'exceljs';
import { excelReport } from './excel-report';

describe('Excel exports', () => {
  it('preserves numeric money, literal user text, filters and embedded chart', async () => {
    const buffer = await excelReport('Prueba', '2026-10-01 a 2026-10-15 · Sede 1', [{
      name: 'Ventas', headers: ['Producto', 'Ventas'], money: [1],
      rows: [['=HYPERLINK("https://example.com")', 1234.56], ['A&B <test>', -50]],
      chart: { title: 'Ventas & ingresos', label: 0, value: 1 },
    }]);
    const book = new Workbook();
    await book.xlsx.load(buffer as any);
    const sheet = book.getWorksheet('Ventas')!;
    expect(sheet.getCell('A2').value).toContain('Sede 1');
    expect(sheet.getCell('A6').value).toBe('=HYPERLINK("https://example.com")');
    expect(sheet.getCell('B6').value).toBe(1234.56);
    expect(sheet.getCell('B6').numFmt).toContain('#,##0.00');
    expect(sheet.getImages()).toHaveLength(1);
    expect(sheet.autoFilter).toBeDefined();
  });
  it('exports empty periods without fabricated values or charts', async () => {
    const book = new Workbook();
    await book.xlsx.load(await excelReport('Vacío', 'Sin ventas', [{ name: 'Datos', headers: ['Concepto', 'Valor'], rows: [], chart: { title: 'Ventas', label: 0, value: 1 } }]) as any);
    expect(book.getWorksheet('Datos')!.getCell('A6').value).toBe('Sin datos para este periodo.');
    expect(book.getWorksheet('Datos')!.getImages()).toHaveLength(0);
  });
});
