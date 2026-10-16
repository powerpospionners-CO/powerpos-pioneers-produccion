import { Prisma } from '@prisma/client';
import { AntiguedadService, rangosAntiguedad } from './antiguedad.service';

describe('Account aging', () => {
  it('assigns today, month boundaries and older debt to exactly one range', () => {
    const rangos = rangosAntiguedad('2026-10-15');
    for (const dias of [0, 1, 30, 31, 60, 61, 90, 91, -1]) {
      const date = new Date(Date.parse('2026-10-15T05:00:00Z') - dias * 86400000);
      const matches = rangos.filter(r => (!r.vencimiento.gte || date >= r.vencimiento.gte) && (!r.vencimiento.lt || date < r.vencimiento.lt));
      expect(matches).toHaveLength(1);
      expect(matches[0].rango).toBe(dias <= 0 ? 'Al día' : dias <= 30 ? '1 a 30 días' : dias <= 60 ? '31 a 60 días' : dias <= 90 ? '61 a 90 días' : 'Más de 90 días');
    }
  });
  it('aggregates current open balances by authenticated company without list limits', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-16T02:00:00Z'));
    try {
      const groupBy = jest.fn().mockResolvedValue([{ tipo: 'COBRAR', _sum: { saldo: new Prisma.Decimal('10.11') }, _count: 700 }]);
      const db: any = { $transaction: jest.fn(fn => fn({ cuentaAdministrativa: { groupBy } })) };
      const result = await new AntiguedadService(db).consultar(7);
      expect(result.fecha).toBe('2026-10-15');
      expect(result.totalCobrar).toBe(50.55);
      expect(result.vencidoCobrar).toBe(40.44);
      expect(result.totalPagar).toBe(0);
      expect(result.filas[0].cuentasCobrar).toBe(700);
      expect(groupBy).toHaveBeenCalledTimes(5);
      for (const [query] of groupBy.mock.calls) {
        expect(query.where).toMatchObject({ empresaId: 7, anulada: false, saldo: { gt: 0 } });
        expect(query.take).toBeUndefined();
      }
      expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
    } finally { jest.useRealTimers(); }
  });
});
