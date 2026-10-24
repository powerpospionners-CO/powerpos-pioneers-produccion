import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccesoTemporal, Identidad } from '../auth/acceso-temporal';
import { FinancieroService } from '../financiero/financiero.service';
import { dinero, fechaDia } from '../administracion/administracion.service';
import { fechaBogota } from '../caja/calendario-caja';

const CATEGORIAS = ['COMPRA_INSUMOS','NOMINA','SERVICIOS','ARRIENDO','MANTENIMIENTO','IMPUESTOS','COMISION_DISTRIBUIDOR','OTROS'];
@Injectable()
export class AccesoGastosService extends AccesoTemporal {
  constructor(prisma: PrismaService, private readonly financiero: FinancieroService) { super(prisma, 'AccesoGastos', 'financiero'); }

  async registrar(usuario: Identidad, token: unknown, datos: any) {
    await this.verificar(usuario, token);
    if (!Number.isSafeInteger(usuario.sucursalId) || !usuario.sucursalId) throw new ForbiddenException('Tu usuario debe tener una sucursal asignada');
    if (!datos || typeof datos !== 'object' || Array.isArray(datos) || Object.keys(datos).some(k => !['categoria','descripcion','monto','fecha','pagadoConRecaudo','clave'].includes(k))) throw new BadRequestException('Solo puedes registrar los datos del formulario de gasto');
    if (!CATEGORIAS.includes(datos.categoria) || typeof datos.descripcion !== 'string' || datos.descripcion.trim().length < 3 || datos.descripcion.trim().length > 250 || typeof datos.pagadoConRecaudo !== 'boolean') throw new BadRequestException('Completa categoría, descripción y origen del dinero');
    if (typeof datos.clave !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(datos.clave)) throw new BadRequestException('Identificador del envío no válido');
    const monto = dinero(datos.monto);
    const fecha = fechaDia(datos.fecha ?? fechaBogota(new Date()));
    if (fecha.getTime() > Date.now()) throw new BadRequestException('La fecha del gasto no puede ser futura');
    const limpio = { categoria: datos.categoria, descripcion: datos.descripcion.trim(), monto: monto.toNumber(), fecha: fecha.toISOString(), pagadoConRecaudo: datos.pagadoConRecaudo };
    const firma = createHash('sha256').update(JSON.stringify(limpio)).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Serializa reintentos del mismo usuario, también entre procesos.
      const filas = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM usuarios WHERE id = ${usuario.id} AND "empresaId" = ${usuario.empresaId} FOR UPDATE`;
      if (!filas.length) throw new ForbiddenException('Usuario no disponible');
      const anterior = await tx.auditoria.findFirst({ where: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: 'GastoEmpleado:' + datos.clave } });
      if (anterior) {
        if ((anterior.detalle as any)?.firma !== firma) throw new ConflictException('Este envío ya fue utilizado con otros datos. Inicia un gasto nuevo');
        return { id: anterior.entidadId, ...limpio, repetido: true };
      }
      const movimiento = await this.financiero.registrarMovimiento({ ...limpio, tipo: 'EGRESO' }, usuario.id, usuario.empresaId, usuario.sucursalId!, tx);
      await tx.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: 'GastoEmpleado:' + datos.clave, entidadId: movimiento.id, accion: 'REGISTRAR', detalle: { firma, ...limpio } } });
      return { id: movimiento.id, ...limpio, repetido: false };
    });
  }
}
