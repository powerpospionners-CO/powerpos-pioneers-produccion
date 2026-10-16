import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fechaDia } from './administracion.service';
import { excelReport } from '../common/excel-report';

export function rangosAntiguedad(hoy: string) {
  const inicio = fechaDia(hoy);
  const hace = (dias: number) => new Date(inicio.getTime() - dias * 86400000);
  return [
    { rango: 'Al día', vencimiento: { gte: inicio } },
    { rango: '1 a 30 días', vencimiento: { gte: hace(30), lt: inicio } },
    { rango: '31 a 60 días', vencimiento: { gte: hace(60), lt: hace(30) } },
    { rango: '61 a 90 días', vencimiento: { gte: hace(90), lt: hace(60) } },
    { rango: 'Más de 90 días', vencimiento: { lt: hace(90) } },
  ];
}

@Injectable()
export class AntiguedadService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(empresaId: number) {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const rangos = rangosAntiguedad(fecha);
    // Aggregate all open accounts, independently of the 500-row operational list.
    const filas = await this.prisma.$transaction(async tx => {
      return Promise.all(rangos.map(async ({ rango, vencimiento }) => {
        const grupos = await tx.cuentaAdministrativa.groupBy({
          by: ['tipo'], where: { empresaId, anulada: false, saldo: { gt: 0 }, tipo: { in: ['COBRAR', 'PAGAR'] }, vencimiento },
          _sum: { saldo: true }, _count: true,
        });
        const cobrar = grupos.find(g => g.tipo === 'COBRAR');
        const pagar = grupos.find(g => g.tipo === 'PAGAR');
        return { rango, cobrar: Number(cobrar?._sum.saldo || 0), pagar: Number(pagar?._sum.saldo || 0), cuentasCobrar: cobrar?._count || 0, cuentasPagar: pagar?._count || 0 };
      }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const sumar = (clave: 'cobrar' | 'pagar', vencidas = false) => Number(filas.slice(vencidas ? 1 : 0).reduce((s, f) => s + f[clave], 0).toFixed(2));
    return { fecha, filas, totalCobrar: sumar('cobrar'), totalPagar: sumar('pagar'), vencidoCobrar: sumar('cobrar', true), vencidoPagar: sumar('pagar', true) };
  }

  async exportar(empresaId: number) {
    const d = await this.consultar(empresaId);
    return excelReport('Antigüedad de cuentas', `Saldos actuales al ${d.fecha} · Colombia. Las cuentas que vencen hoy están al día. No incluye cuentas anuladas ni saldadas.`, [
      { name: 'Cuentas por cobrar', headers: ['Antigüedad', 'Saldo', 'Cuentas'], money: [1], rows: d.filas.map(f => [f.rango, f.cobrar, f.cuentasCobrar]), chart: { title: 'Cartera por cobrar · COP', label: 0, value: 1 } },
      { name: 'Cuentas por pagar', headers: ['Antigüedad', 'Saldo', 'Cuentas'], money: [1], rows: d.filas.map(f => [f.rango, f.pagar, f.cuentasPagar]), chart: { title: 'Obligaciones por pagar · COP', label: 0, value: 1 } },
    ]);
  }
}
