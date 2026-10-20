import { reciboTrailer } from './recibo-trailer';

describe('Recibo térmico del Trailer', () => {
  it('coloca el mensaje cristiano al pie y respeta el ancho del papel', () => {
    const texto = reciboTrailer({ numero: '1', total: 0, detalles: [] }, {}, Buffer.alloc(0), 'Que Dios bendiga tu vida y a toda tu familia').toString('ascii');
    expect(texto.indexOf('Que Dios')).toBeGreaterThan(texto.indexOf('Te esperamos de nuevo'));
    expect(texto.replace(/\s+/g, ' ')).toContain('Que Dios bendiga tu vida y a toda tu familia');
    expect(texto.replace(/\x1bE[\x00\x01]|\x1d![\x00\x01]/g, '').split('\n').every(l => l.length <= 32)).toBe(true);
  });
  const pedido = { numero: 'PED-1-20261019-0001', creadoEn: '2026-10-19T15:30:00Z', total: 28000, metodoPago: 'MIXTO', pagos: [{ metodoPago: 'EFECTIVO', monto: 20000 }, { metodoPago: 'NEQUI', monto: 8000 }], cambio: 10000,
    detalles: [{ cantidad: 2, producto: { nombre: 'HAMBURGUESA ESPECIAL DE LA CASA CON DOBLE CARNE' }, subtotal: 28000, adicionales: [{ nombre: 'QUESO MOZZARELLA', precio: 2000, cantidad: 2 }], observacion: '[Para llevar] Sin salsa', exclusiones: ['Cebolla'] }] };
  it('conserva nombre completo, extras, pagos y cambio dentro de 32 columnas', () => {
    const bytes = reciboTrailer(pedido, { nombre: 'EL TRAILER DEL SABOR', telefono: '3001234567' });
    const texto = bytes.toString('ascii').replace(/\x1bE[\x00\x01]|\x1d![\x00\x01]/g, '');
    expect(texto).toContain('COMPROBANTE DE VENTA');
    expect(texto.replace(/\s+/g, ' ')).toContain('HAMBURGUESA ESPECIAL DE LA CASA CON DOBLE CARNE');
    expect(texto).toContain('QUESO MOZZARELLA'); expect(texto).toContain('TOTAL A PAGAR');
    expect(texto).toMatch(/Efectivo recibido\s+\$30\.000/); expect(texto).toMatch(/Cambio\s+\$10\.000/);
    expect(texto).toMatch(/NEQUI\s+\$8\.000/); expect(texto).toContain('10:30');
    expect(texto.split('\n').every(l => l.length <= 32)).toBe(true);
    expect(bytes.includes(Buffer.from([0x1d, 0x21, 1]))).toBe(true);
  });
  it('no inventa efectivo en crédito y distingue el saldo pendiente', () => {
    const texto = reciboTrailer({ ...pedido, metodoPago: 'CREDITO', pagos: [], cambio: 0 }, {}).toString('ascii');
    expect(texto).toContain('PENDIENTE DE COBRO'); expect(texto).not.toContain('Efectivo recibido');
  });
});
