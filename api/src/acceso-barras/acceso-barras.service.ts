import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

type Identidad = { id: number; empresaId: number; sucursalId?: number; permisos?: Record<string, unknown> };
const CONFIG = 'AccesoBarrasConfiguracion';
const SESION = 'AccesoBarrasSesion';
const INTENTO = 'AccesoBarrasIntento';
const digest = (texto: string) => createHash('sha256').update(texto).digest('hex');

@Injectable()
export class AccesoBarrasService {
  constructor(private readonly prisma: PrismaService) {}

  // Configuración versionada y revocable en el registro de eventos existente.
  // Los hashes nunca se devuelven en listados, sesiones o auditoría pública.
  private configuracion(usuario: Identidad) {
    return this.prisma.auditoria.findFirst({ where: { empresaId: usuario.empresaId, entidad: CONFIG, entidadId: usuario.id }, orderBy: { id: 'desc' } });
  }

  async estado(usuario: Identidad) {
    const config = await this.configuracion(usuario);
    return { habilitado: (config?.detalle as any)?.habilitado === true };
  }

  async configurar(id: number, habilitado: boolean, admin: Identidad) {
    if (!Number.isSafeInteger(id) || id < 1 || typeof habilitado !== 'boolean') throw new BadRequestException('Usuario o autorización no válidos');
    const usuario = await this.prisma.usuario.findFirst({ where: { id, empresaId: admin.empresaId, activo: true }, select: { id: true, rol: true } });
    if (!usuario || usuario.rol !== 'CAJERO') throw new BadRequestException('Selecciona un cajero activo de tu empresa');
    const codigo = habilitado ? String(randomInt(10000000, 100000000)) : null;
    await this.prisma.auditoria.create({ data: { empresaId: admin.empresaId, usuarioId: admin.id, entidad: CONFIG, entidadId: id, accion: habilitado ? 'AUTORIZAR' : 'REVOCAR', detalle: { habilitado, hash: codigo ? await bcrypt.hash(codigo, 10) : null } } });
    return { habilitado, codigo, mensaje: habilitado ? 'Entrega este código al usuario. Solo se muestra ahora.' : 'Acceso revocado y sesiones invalidadas.' };
  }

  async desbloquear(usuario: Identidad, codigo: unknown) {
    const config = await this.configuracion(usuario);
    const detalle = config?.detalle as any;
    if (!detalle?.habilitado || usuario.permisos?.productos === false) throw new ForbiddenException('El administrador no ha autorizado este acceso');
    // Registrar antes de contar limita también los intentos concurrentes y entre procesos.
    await this.prisma.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: INTENTO, entidadId: usuario.id, accion: 'INTENTO' } });
    const intentos = await this.prisma.auditoria.count({ where: { empresaId: usuario.empresaId, entidad: INTENTO, entidadId: usuario.id, creadoEn: { gte: new Date(Date.now() - 15 * 60000) } } });
    if (intentos > 5) throw new ForbiddenException('Demasiados intentos. Espera 15 minutos');
    if (typeof codigo !== 'string' || !/^\d{8}$/.test(codigo) || !await bcrypt.compare(codigo, detalle.hash)) throw new ForbiddenException('Código de acceso incorrecto');
    const token = randomBytes(32).toString('hex');
    const venceEn = Date.now() + 30 * 60000;
    await this.prisma.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: SESION, entidadId: usuario.id, accion: 'DESBLOQUEAR', detalle: { hash: digest(token), configuracionId: config!.id, venceEn, sucursalId: usuario.sucursalId } } });
    return { token, venceEn };
  }

  async verificar(usuario: Identidad, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ForbiddenException('Ingresa el código de acceso');
    if (usuario.permisos?.productos === false) throw new ForbiddenException('Productos no está habilitado en esta empresa');
    const [config, sesion] = await Promise.all([
      this.configuracion(usuario),
      this.prisma.auditoria.findFirst({ where: { empresaId: usuario.empresaId, entidad: SESION, entidadId: usuario.id }, orderBy: { id: 'desc' } }),
    ]);
    const datos = sesion?.detalle as any;
    if (!(config?.detalle as any)?.habilitado || !datos || datos.configuracionId !== config?.id || datos.venceEn < Date.now() || datos.sucursalId !== usuario.sucursalId || typeof datos.hash !== 'string' || datos.hash.length !== 64 || !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(datos.hash))) throw new ForbiddenException('El acceso venció o fue revocado. Ingresa de nuevo el código');
  }

  async listar(usuario: Identidad, token: unknown, buscar = '', despues?: string, sinCodigo?: string) {
    await this.verificar(usuario, token);
    const cursor = Number(despues);
    const filas = await this.prisma.producto.findMany({
      where: { empresaId: usuario.empresaId, activo: true, ...(Number.isSafeInteger(cursor) && cursor > 0 ? { id: { gt: cursor } } : {}),
        ...(buscar.trim() ? { nombre: { contains: buscar.trim().slice(0,100) } } : {}),
        ...(sinCodigo === 'true' ? { OR: [
          { presentaciones: { some: { activo: true, OR: [{ codigoBarras: null }, { codigoBarras: '' }] } } },
          { codigosBarras: { some: { codigoBarras: '' } } },
          { AND: [{ OR: [{ codigoBarras: null }, { codigoBarras: '' }] }, { presentaciones: { none: { activo: true } } }, { codigosBarras: { none: {} } }] },
        ] } : {}),
      }, orderBy: { id: 'asc' }, take: 51, select: { id: true, nombre: true, codigoBarras: true,
        presentaciones: { where: { activo: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }], select: { id: true, nombre: true, codigoBarras: true } },
        codigosBarras: { orderBy: { id: 'asc' }, select: { id: true, sabor: true, codigoBarras: true } },
      },
    });
    return { productos: filas.slice(0,50), siguiente: filas.length > 50 ? filas[49].id : null };
  }

  async guardar(usuario: Identidad, token: unknown, id: number, datos: any) {
    await this.verificar(usuario, token);
    if (!Number.isSafeInteger(id) || id < 1 || !datos || Object.keys(datos).some(k => !['codigoBarras', 'anterior', 'tipo', 'destinoId'].includes(k)) || typeof datos.codigoBarras !== 'string' || !/^[\x21-\x7e]{1,80}$/.test(datos.codigoBarras) || !(datos.anterior === null || typeof datos.anterior === 'string')) throw new BadRequestException('Solo puedes ingresar un código de barras válido de hasta 80 caracteres');
    const tipo = datos.tipo ?? 'PRODUCTO';
    if (!['PRODUCTO','PRESENTACION','SABOR'].includes(tipo) || (tipo !== 'PRODUCTO' && (!Number.isSafeInteger(datos.destinoId) || datos.destinoId < 1)) || (tipo === 'PRODUCTO' && datos.destinoId !== undefined)) throw new BadRequestException('Destino de código no válido');
    try {
      return await this.prisma.$transaction(async tx => {
        const producto = await tx.producto.findFirst({ where: { id, empresaId: usuario.empresaId, activo: true }, select: { id: true, nombre: true, codigoBarras: true } });
        if (!producto) throw new NotFoundException('Producto no encontrado');
        const destino = tipo === 'PRESENTACION'
          ? await tx.productoPresentacion.findFirst({ where: { id: datos.destinoId, productoId: id, activo: true, producto: { empresaId: usuario.empresaId } }, select: { id: true, nombre: true, codigoBarras: true } })
          : tipo === 'SABOR'
            ? await tx.productoCodigoBarras.findFirst({ where: { id: datos.destinoId, productoId: id, empresaId: usuario.empresaId }, select: { id: true, sabor: true, codigoBarras: true } })
            : producto;
        if (!destino) throw new NotFoundException('La presentación o sabor no pertenece a este producto');
        if (destino.codigoBarras !== datos.anterior) throw new ConflictException('Otro usuario cambió este código. Actualiza la lista antes de guardar');
        const nombre = tipo === 'PRODUCTO' ? producto.nombre : `${producto.nombre} · ${tipo === 'PRESENTACION' ? destino['nombre'] : destino['sabor']}`;
        const codigoBarras = datos.codigoBarras;
        const [otro, variante, presentacion] = await Promise.all([
          tx.producto.findFirst({ where: { empresaId: usuario.empresaId, codigoBarras, ...(tipo === 'PRODUCTO' ? { id: { not: id } } : {}) }, select: { id: true } }),
          tx.productoCodigoBarras.findFirst({ where: { empresaId: usuario.empresaId, codigoBarras, ...(tipo === 'SABOR' ? { id: { not: datos.destinoId } } : {}) }, select: { id: true } }),
          tx.productoPresentacion.findFirst({ where: { codigoBarras, producto: { empresaId: usuario.empresaId }, ...(tipo === 'PRESENTACION' ? { id: { not: datos.destinoId } } : {}) }, select: { id: true } }),
        ]);
        if (otro || variante || presentacion) throw new ConflictException('Ese código ya está asignado a otro producto, sabor o presentación');
        const cambio = tipo === 'PRESENTACION'
          ? await tx.productoPresentacion.updateMany({ where: { id: datos.destinoId, productoId: id, activo: true, producto: { empresaId: usuario.empresaId }, codigoBarras: datos.anterior }, data: { codigoBarras } })
          : tipo === 'SABOR'
            ? await tx.productoCodigoBarras.updateMany({ where: { id: datos.destinoId, productoId: id, empresaId: usuario.empresaId, codigoBarras: datos.anterior }, data: { codigoBarras } })
            : await tx.producto.updateMany({ where: { id, empresaId: usuario.empresaId, codigoBarras: datos.anterior }, data: { codigoBarras } });
        if (cambio.count !== 1) throw new ConflictException('El código cambió. Actualiza la lista');
        await tx.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: 'ProductoCodigoBarras', entidadId: id, accion: 'MODIFICAR', detalle: { anterior: destino.codigoBarras, nuevo: codigoBarras, nombre, tipo, destinoId: destino.id } } });
        return { id, nombre, codigoBarras, anterior: destino.codigoBarras, tipo, destinoId: destino.id };
      });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Ese código ya está asignado');
      throw error;
    }
  }
}
