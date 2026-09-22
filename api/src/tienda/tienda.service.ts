import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { monto, puntosConfig, SLUGS_RESERVADOS, texto, tiendaConfig } from './reglas';

@Injectable()
export class TiendaService {
  async resumen(user: any) {
    const pendientes = await this.prisma.pedidoWeb.count({where:{empresaId:user.empresaId,estado:'RECIBIDO',...(user.rol==='CAJERO'?{sucursalId:user.sucursalId}: {})}});
    return {pendientes};
  }
  constructor(
    private prisma: PrismaService,
    private pedidos: PedidosService,
  ) {}

  async configuracion(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    return {
      slug: empresa.tiendaSlug,
      tienda: tiendaConfig(empresa.tiendaConfig),
      fidelizacion: puntosConfig(empresa.fidelizacionConfig),
    };
  }

  async configurar(empresaId: number, body: any) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Configuración inválida');
    const actual = await this.configuracion(empresaId);
    const t = { ...actual.tienda, ...body.tienda };
    const p = { ...actual.fidelizacion, ...body.fidelizacion };
    for (const campo of ['publicada', 'pedidosHabilitados'])
      if (typeof t[campo] !== 'boolean')
        throw new BadRequestException('Estado de tienda inválido');
    for (const campo of [
      'titulo',
      'descripcion',
      'sobreNosotros',
      'horario',
      'whatsapp',
      'portada',
      'color',
      'facebook',
      'instagram',
      'tiktok',
    ])
      t[campo] = texto(
        t[campo],
        campo,
        campo === 'descripcion' || campo === 'sobreNosotros' ? 2000 : 500,
      );
    if (!/^#[0-9a-f]{6}$/i.test(t.color))
      throw new BadRequestException('Color inválido');
    if (t.portada && !/^https:\/\//i.test(t.portada))
      throw new BadRequestException('La portada debe usar HTTPS');
    if (t.whatsapp && !/^\d{10,15}$/.test(t.whatsapp))
      throw new BadRequestException(
        'WhatsApp: incluya indicativo de país y solo números',
      );
    monto(t.minimo, 'Pedido mínimo');
    if (!Array.isArray(t.zonas) || t.zonas.length > 30)
      throw new BadRequestException('Zonas no válidas');
    t.zonas = t.zonas.map((z) => ({
      nombre: texto(z.nombre, 'Zona', 80, true),
      costo: monto(z.costo, 'Tarifa'),
    }));
    if (new Set(t.zonas.map((z) => z.nombre)).size !== t.zonas.length)
      throw new BadRequestException('No repita zonas');
    if (
      t.sucursalId &&
      !(await this.prisma.sucursal.findFirst({
        where: { id: t.sucursalId, empresaId, activo: true },
      }))
    )
      throw new BadRequestException('Sucursal inválida');
    if (t.pedidosHabilitados && (!t.sucursalId || !t.zonas.length))
      throw new BadRequestException(
        'Seleccione sucursal y zonas antes de recibir pedidos',
      );
    if (typeof p.habilitado !== 'boolean')
      throw new BadRequestException('Fidelización inválida');
    monto(p.compraPorPunto, 'Compra por punto', p.habilitado ? 0.01 : 0);
    monto(p.valorPunto, 'Valor de canje', p.habilitado ? 0.01 : 0);
    for (const campo of ['categoriasExcluidas', 'productosExcluidos']) {
      if (
        !Array.isArray(p[campo]) ||
        p[campo].some((id) => !Number.isInteger(id) || id < 1)
      )
        throw new BadRequestException('Exclusiones inválidas');
      p[campo] = [...new Set(p[campo])];
    }
    const [cats, prods] = await Promise.all([
      this.prisma.categoria.count({
        where: { empresaId, id: { in: p.categoriasExcluidas } },
      }),
      this.prisma.producto.count({
        where: { empresaId, id: { in: p.productosExcluidos } },
      }),
    ]);
    if (
      cats !== p.categoriasExcluidas.length ||
      prods !== p.productosExcluidos.length
    )
      throw new BadRequestException(
        'Las exclusiones deben pertenecer a su empresa',
      );
    const slug = texto(body.slug ?? actual.slug, 'Enlace', 80, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new BadRequestException(
        'Use letras minúsculas, números y guiones para el enlace',
      );
    if (SLUGS_RESERVADOS.has(slug))
      throw new BadRequestException(
        'Ese enlace está reservado por el sistema. Elija otro.',
      );
    // Lista explícita: no persistir claves arbitrarias recibidas del navegador.
    const tienda = {
      publicada: t.publicada,
      pedidosHabilitados: t.pedidosHabilitados,
      titulo: t.titulo,
      descripcion: t.descripcion,
      sobreNosotros: t.sobreNosotros,
      color: t.color,
      portada: t.portada,
      whatsapp: t.whatsapp,
      horario: t.horario,
      facebook: t.facebook,
      instagram: t.instagram,
      tiktok: t.tiktok,
      sucursalId: t.sucursalId,
      minimo: t.minimo,
      zonas: t.zonas,
    };
    const fidelizacion = {
      habilitado: p.habilitado,
      compraPorPunto: p.compraPorPunto,
      valorPunto: p.valorPunto,
      categoriasExcluidas: p.categoriasExcluidas,
      productosExcluidos: p.productosExcluidos,
    };
    try {
      await this.prisma.empresa.update({
        where: { id: empresaId },
        data: {
          ...(body.slug !== undefined ? { tiendaSlug: slug } : {}),
          ...(body.tienda !== undefined ? { tiendaConfig: tienda } : {}),
          ...(body.fidelizacion !== undefined
            ? { fidelizacionConfig: fidelizacion }
            : {}),
        },
      });
    } catch (e) {
      if (e.code === 'P2002')
        throw new ConflictException('Ese enlace ya está en uso');
      throw e;
    }
    return this.configuracion(empresaId);
  }

  private async empresaPublica(slug: string) {
    const e = await this.prisma.empresa.findUnique({
      where: { tiendaSlug: slug },
    });
    if (!e?.activo || !tiendaConfig(e.tiendaConfig).publicada)
      throw new NotFoundException('Tienda no disponible');
    return e;
  }
  async catalogo(slug: string) {
    const e = await this.empresaPublica(slug);
    const config = tiendaConfig(e.tiendaConfig);
    const productos = await this.prisma.producto.findMany({
      where: { empresaId: e.id, activo: true, categoria: { activo: true } },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        precio: true,
        imagen: true,
        disponible: true,
        categoriaId: true,
        categoria: { select: { nombre: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return {
      nombre: e.nombre,
      logo: e.logo,
      direccion: e.direccion,
      telefono: e.telefono,
      config,
      productos,
    };
  }

  async solicitar(slug: string, body: any) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Pedido inválido');
    const e = await this.empresaPublica(slug);
    const t = tiendaConfig(e.tiendaConfig);
    if (!t.pedidosHabilitados)
      throw new BadRequestException('La tienda no recibe pedidos por ahora');
    const clave = texto(body.clave, 'Identificador', 80, true);
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(clave))
      throw new BadRequestException('Identificador inválido');
    const existente = await this.prisma.pedidoWeb.findUnique({
      where: { empresaId_clave: { empresaId: e.id, clave } },
    });
    if (existente)
      return {
        id: existente.id,
        estado: existente.estado,
        total: existente.total,
      };
    const nombre = texto(body.nombre, 'Nombre', 100, true),
      telefono = texto(body.telefono, 'Teléfono', 20, true),
      direccion = texto(body.direccion, 'Dirección', 300, true);
    if (!/^[+\d\s()-]{7,20}$/.test(telefono))
      throw new BadRequestException('Teléfono inválido');
    const observacion = texto(body.observacion ?? '', 'Observaciones', 500);
    const zona = t.zonas.find((z) => z.nombre === body.zona);
    if (!zona)
      throw new BadRequestException(
        'Seleccione una zona atendida por la empresa',
      );
    if (
      !(await this.prisma.sucursal.findFirst({
        where: { id: t.sucursalId, empresaId: e.id, activo: true },
      }))
    )
      throw new BadRequestException('Sucursal no disponible');
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 100 ||
      body.items.some(
        (i) =>
          !Number.isInteger(i.productoId) ||
          !Number.isInteger(i.cantidad) ||
          i.cantidad < 1 ||
          i.cantidad > 99,
      ) ||
      new Set(body.items.map((i) => i.productoId)).size !== body.items.length
    )
      throw new BadRequestException('Carrito inválido');
    if (
      !['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'].includes(
        body.metodoPago,
      )
    )
      throw new BadRequestException('Medio de pago inválido');
    const productos = await this.prisma.producto.findMany({
      where: {
        empresaId: e.id,
        id: { in: body.items.map((i) => i.productoId) },
        activo: true,
        disponible: true,
        categoria: { activo: true },
      },
    });
    if (productos.length !== body.items.length)
      throw new BadRequestException(
        'Un producto ya no está disponible. Actualice el catálogo.',
      );
    const items = body.items.map((i) => {
      const p = productos.find((p) => p.id === i.productoId)!;
      return {
        productoId: p.id,
        nombre: p.nombre,
        cantidad: i.cantidad,
        precio: Number(p.precio),
      };
    });
    const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    if (subtotal < t.minimo)
      throw new BadRequestException(`La compra mínima es $${t.minimo}`);
    const total = subtotal + zona.costo;
    monto(total, 'Total del pedido', 0, 99999999.99);
    if (
      Math.abs(Number(body.totalEsperado) - total) > 0.009 ||
      !Number.isFinite(body.totalEsperado)
    )
      throw new ConflictException(
        'Los precios o la tarifa cambiaron. Actualice el catálogo antes de confirmar.',
      );
    // Límite persistente por teléfono/empresa; evita spam básico entre instancias.
    if (
      (await this.prisma.pedidoWeb.count({
        where: {
          empresaId: e.id,
          telefono,
          creadoEn: { gte: new Date(Date.now() - 600000) },
        },
      })) >= 5
    )
      throw new BadRequestException(
        'Ya recibimos varias solicitudes de este teléfono. Contacte a la empresa.',
      );
    try {
      const pedido = await this.prisma.pedidoWeb.create({
        data: {
          empresaId: e.id,
          sucursalId: t.sucursalId,
          clave,
          nombre,
          telefono,
          direccion,
          zona: zona.nombre,
          observacion,
          items,
          subtotal,
          costoDomicilio: zona.costo,
          total,
          metodoPago: body.metodoPago,
        },
      });
      return { id: pedido.id, estado: pedido.estado, total: pedido.total };
    } catch (err) {
      if (err.code === 'P2002') {
        const p = await this.prisma.pedidoWeb.findUniqueOrThrow({
          where: { empresaId_clave: { empresaId: e.id, clave } },
        });
        return { id: p.id, estado: p.estado, total: p.total };
      }
      throw err;
    }
  }
  async seguimiento(slug: string, id: string) {
    const e = await this.empresaPublica(slug);
    const p = await this.prisma.pedidoWeb.findFirst({
      where: { id, empresaId: e.id },
      select: {
        id: true,
        estado: true,
        total: true,
        motivo: true,
        pedido: { select: { numero: true, estado: true } },
      },
    });
    if (!p) throw new NotFoundException('Pedido no encontrado');
    return p;
  }
  listar(user: any) {
    return this.prisma.pedidoWeb.findMany({
      where: {
        empresaId: user.empresaId,
        ...(user.rol === 'DOMICILIARIO'
          ? { repartidorId: user.id }
          : user.rol === 'CAJERO'
            ? { sucursalId: user.sucursalId }
            : {}),
      },
      include: { pedido: { select: { numero: true, estado: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
  }
  repartidores(user: any) {
    return this.prisma.usuario.findMany({
      where: { empresaId: user.empresaId, activo: true, rol: 'DOMICILIARIO' },
      select: { id: true, nombre: true },
    });
  }
  async gestionar(id: string, body: any, user: any) {
    return this.prisma.$transaction(
      async (tx) => {
        // Bloqueo persistente: dos cajeros no pueden convertir la misma solicitud en dos ventas.
        await tx.$queryRaw`SELECT id FROM pedidos_web WHERE id = ${id} AND "empresaId" = ${user.empresaId} FOR UPDATE`;
        const p = await tx.pedidoWeb.findFirst({
          where: { id, empresaId: user.empresaId },
        });
        if (!p) throw new NotFoundException('Pedido no encontrado');
        if (user.rol === 'CAJERO' && p.sucursalId !== user.sucursalId)
          throw new ForbiddenException('Pedido de otra sucursal');
        if (
          user.rol === 'DOMICILIARIO' &&
          (p.repartidorId !== user.id || body.accion !== 'ENTREGADO')
        )
          throw new ForbiddenException('Entrega no asignada');
        if (body.accion === 'ACEPTAR') {
          if (p.estado !== 'RECIBIDO')
            throw new ConflictException('El pedido ya fue revisado');
          const items = p.items as any[];
          const prods = await tx.producto.findMany({
            where: {
              empresaId: user.empresaId,
              id: { in: items.map((i) => i.productoId) },
              activo: true,
              disponible: true,
            },
          });
          if (
            items.some(
              (i) =>
                !prods.some(
                  (prod) =>
                    prod.id === i.productoId &&
                    Number(prod.precio) === i.precio,
                ),
            )
          )
            throw new ConflictException(
              'Cambió el catálogo. Contacte al cliente antes de solicitar un nuevo pedido.',
            );
          // No vincular por teléfono a un cliente existente: el comprador público no autenticó su identidad.
          const venta = await this.pedidos.crearEnTransaccion(
            {
              items,
              metodoPago: p.metodoPago,
              sucursalId: p.sucursalId,
              clienteId: body.clienteId || null,
              observacion: `DOMICILIO: ${p.nombre} · ${p.telefono} · ${p.direccion}. ${p.observacion || ''}`,
            },
            user.id,
            user.empresaId,
            tx,
            Number(p.costoDomicilio),
          );
          if (Number(venta.total) !== Number(p.total))
            throw new ConflictException(
              'Cambió el precio durante la revisión. No se registró la venta.',
            );
          return tx.pedidoWeb.update({
            where: { id },
            data: { estado: 'ACEPTADO', pedidoId: venta.id },
          });
        }
        if (body.accion === 'RECHAZAR') {
          if (p.estado !== 'RECIBIDO')
            throw new ConflictException(
              'Solo se rechazan solicitudes sin aceptar',
            );
          return tx.pedidoWeb.update({
            where: { id },
            data: {
              estado: 'RECHAZADO',
              motivo: texto(body.motivo, 'Motivo', 300, true),
            },
          });
        }
        if (body.accion === 'EN_CAMINO') {
          if (p.estado !== 'ACEPTADO')
            throw new ConflictException('Primero acepte el pedido');
          const repartidor = await tx.usuario.findFirst({
            where: {
              id: body.repartidorId,
              empresaId: user.empresaId,
              activo: true,
              rol: 'DOMICILIARIO',
            },
          });
          if (!repartidor)
            throw new BadRequestException(
              'Seleccione un domiciliario de su empresa',
            );
          return tx.pedidoWeb.update({
            where: { id },
            data: { estado: 'EN_CAMINO', repartidorId: repartidor.id },
          });
        }
        if (body.accion === 'ENTREGADO') {
          if (p.estado !== 'EN_CAMINO')
            throw new ConflictException('El pedido no está en camino');
          await tx.pedido.update({
            where: { id: p.pedidoId! },
            data: { estado: 'ENTREGADO' },
          });
          return tx.pedidoWeb.update({
            where: { id },
            data: { estado: 'ENTREGADO' },
          });
        }
        throw new BadRequestException('Acción inválida');
      },
      { timeout: 15000 },
    );
  }
}
