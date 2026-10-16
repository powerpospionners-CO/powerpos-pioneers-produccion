import { Workbook } from 'exceljs';
import { excelReport } from './excel-report';
import JSZip = require('jszip');

describe('Excel exports', () => {
  it('preserves numeric money, literal user text, filters and embedded chart', async () => {
    const buffer = await excelReport(
      'Prueba',
      '2026-10-01 a 2026-10-15 · Sede 1',
      [
        {
          name: 'Ventas',
          headers: ['Producto', 'Ventas'],
          money: [1],
          rows: [
            ['=HYPERLINK("https://example.com")', 1234.56],
            ['A&B <test>', -50],
          ],
          chart: { title: 'Ventas & ingresos', label: 0, value: 1 },
        },
      ],
    );
    const book = new Workbook();
    await book.xlsx.load(buffer as any);
    const sheet = book.getWorksheet('Ventas')!;
    expect(sheet.getCell('A2').value).toContain('Sede 1');
    expect(sheet.getCell('A6').value).toBe('=HYPERLINK("https://example.com")');
    expect(sheet.getCell('B6').value).toBe(1234.56);
    expect(sheet.getCell('B6').numFmt).toContain('#,##0.00');
    const zip = await JSZip.loadAsync(buffer);
    const chart = await zip.file('xl/charts/chart1.xml')!.async('string');
    expect(chart).toContain('<c:barChart>');
    expect(chart).toContain('&apos;Ventas&apos;!$B$6:$B$7');
    expect(chart).toContain('A&amp;B &lt;test&gt;');
    expect(Object.keys(zip.files).some((p) => p.startsWith('xl/media/'))).toBe(
      false,
    );
    expect(sheet.autoFilter).toBeDefined();
  });
  it.each(['line', 'pie'] as const)(
    'exports a native %s chart with values and labels',
    async (type) => {
      const buffer = await excelReport('Gráficas', 'Prueba', [
        {
          name: 'Datos',
          headers: ['Concepto', 'Valor'],
          rows: [
            ['Efectivo', 120],
            ['Tarjeta', 80],
          ],
          chart: { title: 'Distribución', label: 0, value: 1, type },
        },
      ]);
      const zip = await JSZip.loadAsync(buffer);
      const chart = await zip.file('xl/charts/chart1.xml')!.async('string');
      expect(chart).toContain(`<c:${type}Chart>`);
      expect(chart).toContain('<c:v>120</c:v>');
      expect(
        await zip.file('xl/worksheets/sheet1.xml')!.async('string'),
      ).toContain('rIdPowerPosChart');
    },
  );
  it('exports empty periods without fabricated values or charts', async () => {
    const book = new Workbook();
    await book.xlsx.load(
      (await excelReport('Vacío', 'Sin ventas', [
        {
          name: 'Datos',
          headers: ['Concepto', 'Valor'],
          rows: [],
          chart: { title: 'Ventas', label: 0, value: 1 },
        },
      ])) as any,
    );
    expect(book.getWorksheet('Datos')!.getCell('A6').value).toBe(
      'Sin datos para este periodo.',
    );
    expect(book.getWorksheet('Datos')!.getImages()).toHaveLength(0);
  });
});
