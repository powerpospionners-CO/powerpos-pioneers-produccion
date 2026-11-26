import {validarComercial,productosComerciales,validarSitio} from './contenido-comercial';
import { ahoraColombia, validarFunciones } from './tienda-extras.reglas';
import { adicionalesDeProducto, validarEntrega, validarFuncionesExperiencia, validarLineas } from './tienda-opciones.reglas';
import { TiendaExperienciaService } from './tienda-experiencia.service';
import { TiendaExtrasService } from './tienda-extras.service';
import { mesaValida, TiendaRegistros } from './tienda-registros';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { monto, puntosConfig, SLUGS_RESERVADOS, texto, tiendaConfig } from './reglas';
import { paletaLogoLocal } from '../empresa/paleta-logo-local';
import { agregarOrigen, leerOrigenes } from '../productos/origenes.service';
import { BoldService } from './bold.service';
import { montoBold } from './bold.reglas';
import { validarHorarios, resumenHorarios } from './horarios';

// El pedido web no tiene columna de descuento: es la diferencia entre productos más domicilio y el total.
export function descuentoPedido(p: { subtotal: unknown; costoDomicilio: unknown; total: unknown }) {
  return Math.max(0, Math.round((Number(p.subtotal) + Number(p.costoDomicilio) - Number(p.total)) * 100) / 100);
}

@Injectable()
export class TiendaService {
  private mapaCache?: { vence: number; datos: Promise<{ slug: string }[]> };
  mapaPublico() {
    if (this.mapaCache && this.mapaCache.vence > Date.now()) return this.mapaCache.datos;
    const datos = this.construirMapa();
    this.mapaCache = { vence: Date.now() + 60000, datos };
    void datos.catch(() => { this.mapaCache = undefined; });
    return datos;
  }
  private async construirMapa() {
    if (!this.prisma.aislamientoActivo) {
      const empresas = await this.prisma.control.empresa.findMany({ where: { activo: true }, select: { tiendaSlug: true, tiendaConfig: true } });
      return empresas.filter(e => tiendaConfig(e.tiendaConfig).publicada && e.tiendaSlug && !SLUGS_RESERVADOS.has(e.tiendaSlug)).map(e => ({ slug: e.tiendaSlug }));
    }
    const sedes = await this.prisma.control.baseSede.findMany({ where: { estado: 'ACTIVA' }, select: { slug: true } });
    const resultado: { slug: string }[] = [];
    // Publicar solo sedes que realmente mantienen su tienda visible; nunca datos privados.
    for (const sede of sedes) {
      if (!sede.slug || SLUGS_RESERVADOS.has(sede.slug)) continue;
      try {
        const contexto = await this.prisma.sedePublica(sede.slug);
        const e = await contexto.cliente.empresa.findUnique({ where: { id: contexto.empresaId }, select: { activo: true, tiendaConfig: true } });
        if (e?.activo && tiendaConfig(e.tiendaConfig).publicada) resultado.push({ slug: sede.slug });
      } catch { /* Una sede no disponible no publica información en el mapa. */ }
    }
    return resultado;
  }
  private async identidad(empresa: { logo: string | null; tiendaConfig: unknown }) {
    const config = tiendaConfig(empresa.tiendaConfig);
    if (config.coloresAutomaticos && !config.paletaLogo && empresa.logo) {
      const paleta = await paletaLogoLocal(empresa.logo);
      if (paleta) return { ...config, paletaLogo: paleta, color: paleta.principal };
    }
    return config;
  }
  async resumen(user: any) {
    const pendientes = await this.prisma.pedidoWeb.count({where:{empresaId:user.empresaId,estado:'RECIBIDO',...(user.rol==='CAJERO'?{sucursalId:user.sucursalId}: {})}});
    const reservasHabilitadas = tiendaConfig((await this.prisma.empresa.findUnique({where:{id:user.empresaId},select:{tiendaConfig:true}}))?.tiendaConfig).reservasHabilitadas;
    const reservas = this.extras && reservasHabilitadas ? await this.extras.reservasPendientes(user.empresaId) : 0;
    return {pendientes, reservas, reservasHabilitadas};
  }
  constructor(
    private prisma: PrismaService,
    private pedidos: PedidosService,
    private bold: BoldService,
    // Opcionales para conservar las pruebas que construyen el servicio sin la tienda ampliada.
    @Optional() private registros?: TiendaRegistros,
    @Optional() private extras?: TiendaExtrasService,
    @Optional() private experiencia?: TiendaExperienciaService,
  ) {}

  async configuracion(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    return {
      slug: empresa.tiendaSlug,
      tienda: await this.identidad(empresa),
      fidelizacion: puntosConfig(empresa.fidelizacionConfig),
    };
  }

  async configurar(empresaId: number, body: any) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Configuración inválida');
    const actual = await this.configuracion(empresaId);
    const t = { ...actual.tienda, ...body.tienda };
    if (typeof t.coloresAutomaticos !== 'boolean') throw new BadRequestException('Modo de colores inválido');
    // La paleta procede del logo analizado en el servidor, nunca del navegador.
    t.paletaLogo = actual.tienda.paletaLogo;
    if (t.coloresAutomaticos && t.paletaLogo) t.color = t.paletaLogo.principal;
    const p = { ...actual.fidelizacion, ...body.fidelizacion };
    const comercial = validarComercial(t);
    const sitio = validarSitio(t);
    const funciones = { ...validarFunciones(t), ...validarFuncionesExperiencia(t) };
    // La tabla de registros se crea aquí, con sesión de administrador; nunca desde una petición pública.
    if ((funciones.reservasHabilitadas || funciones.boletinHabilitado || funciones.cuentasHabilitadas || funciones.avisosClientes || funciones.resenasHabilitadas) && this.registros)
      await this.registros.preparar();
    const productosWeb = productosComerciales(comercial);
    if (productosWeb.length && await this.prisma.producto.count({where:{empresaId,id:{in:productosWeb}}}) !== productosWeb.length) throw new BadRequestException('Los productos de la web deben pertenecer a su empresa');
    t.horarios = validarHorarios(t.horarios);
    if (t.horarios) t.horario = resumenHorarios(t.horarios);
    for (const campo of ['publicada', 'pedidosHabilitados'])
      if (typeof t[campo] !== 'boolean')
        throw new BadRequestException('Estado de tienda inválido');
    for (const campo of [
      'titulo',
      'antetitulo',
      'portadaEtiqueta',
      'portadaTexto',
      'descripcion',
      'sobreNosotros',
      'mision',
      'vision',
      'horario',
      'pagos',
      'envios',
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
        ['descripcion', 'sobreNosotros', 'mision', 'vision'].includes(campo) ? 2000 : 500,
      );
    if (!Array.isArray(t.galeria) || t.galeria.length > 12) throw new BadRequestException('Agregue hasta 12 fotos a la galería');
    t.galeria = t.galeria.map(f => {
      const imagen = texto(f?.imagen, 'Foto de galería', 500, true);
      if (!/^https:\/\//i.test(imagen)) throw new BadRequestException('La foto debe usar HTTPS');
      return { imagen, descripcion: texto(f?.descripcion, 'Descripción de foto', 200) };
    });
    if (!Array.isArray(t.preguntasFrecuentes) || t.preguntasFrecuentes.length > 20) throw new BadRequestException('Agregue hasta 20 preguntas frecuentes');
    t.preguntasFrecuentes = t.preguntasFrecuentes.map(p => ({ pregunta: texto(p?.pregunta, 'Pregunta', 200, true), respuesta: texto(p?.respuesta, 'Respuesta', 2000, true) }));
    if (!Array.isArray(t.imagenesCategorias) || t.imagenesCategorias.length > 300)
      throw new BadRequestException('Imágenes de categorías inválidas');
    t.imagenesCategorias = t.imagenesCategorias.map(c => {
      if (!c || !Number.isSafeInteger(c.categoriaId) || c.categoriaId < 1)
        throw new BadRequestException('Categoría inválida');
      const imagen = texto(c.imagen, 'Imagen de categoría', 500, true);
      if (!/^https:\/\//i.test(imagen)) throw new BadRequestException('La imagen de categoría debe usar HTTPS');
      return { categoriaId: c.categoriaId, imagen };
    });
    if (new Set(t.imagenesCategorias.map(c => c.categoriaId)).size !== t.imagenesCategorias.length)
      throw new BadRequestException('No repita imágenes de una categoría');
    if (t.imagenesCategorias.length && await this.prisma.categoria.count({ where: { empresaId, id: { in: t.imagenesCategorias.map(c => c.categoriaId) } } }) !== t.imagenesCategorias.length)
      throw new BadRequestException('Las categorías deben pertenecer a su empresa');
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
    if (t.zonas.some(z => !z || typeof z !== 'object')) throw new BadRequestException('Zona inválida');
    if (!Array.isArray(t.ciudadesEntrega) || t.ciudadesEntrega.length > 30) throw new BadRequestException('Ciudades de entrega inválidas');
    t.ciudadesEntrega = t.ciudadesEntrega.map(c => texto(c, 'Ciudad', 80, true));
    if (new Set(t.ciudadesEntrega.map(c => c.toLocaleLowerCase('es'))).size !== t.ciudadesEntrega.length) throw new BadRequestException('No repita ciudades de entrega');
    t.zonas = t.zonas.map((z, i) => ({
      id: texto(z?.id || `zona-${i + 1}`, 'Identificador de zona', 40, true),
      ciudad: texto(z?.ciudad || '', 'Ciudad', 80),
      nombre: texto(z.nombre, 'Zona', 80, true),
      costo: monto(z.costo, 'Tarifa'),
    }));
    if (t.zonas.some(z => !/^[a-zA-Z0-9-]+$/.test(z.id!) || (z.ciudad && !t.ciudadesEntrega.includes(z.ciudad))) || new Set(t.zonas.map(z => z.id)).size !== t.zonas.length) throw new BadRequestException('Seleccione una ciudad válida e identificadores únicos para las zonas');
    if (new Set(t.zonas.map((z) => `${z.ciudad}:${z.nombre}`.toLocaleLowerCase('es'))).size !== t.zonas.length)
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
      ...comercial,
      ...sitio,
      ...funciones,
      publicada: t.publicada,
      pedidosHabilitados: t.pedidosHabilitados,
      titulo: t.titulo,
      antetitulo: t.antetitulo,
      portadaEtiqueta: t.portadaEtiqueta,
      portadaTexto: t.portadaTexto,
      descripcion: t.descripcion,
      sobreNosotros: t.sobreNosotros,
      mision: t.mision,
      vision: t.vision,
      galeria: t.galeria,
      preguntasFrecuentes: t.preguntasFrecuentes,
      imagenesCategorias: t.imagenesCategorias,
      color: t.color,
      coloresAutomaticos: t.coloresAutomaticos,
      paletaLogo: t.paletaLogo,
      portada: t.portada,
      whatsapp: t.whatsapp,
      horario: t.horario,
      horarios: t.horarios,
      ciudadesEntrega: t.ciudadesEntrega,
      pagos: t.pagos,
      envios: t.envios,
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
      if (body.slug !== undefined && this.prisma.aislamientoActivo) await this.prisma.reservarSlug(slug);
      await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const reciente = await tx.empresa.findUnique({ where: { id: empresaId }, select: { tiendaConfig: true } });
      await tx.empresa.update({
        where: { id: empresaId },
        data: {
          ...(body.slug !== undefined ? { tiendaSlug: slug } : {}),
          ...(body.tienda !== undefined ? { tiendaConfig: { ...tienda, origenes: leerOrigenes(reciente?.tiendaConfig) } } : {}),
          ...(body.fidelizacion !== undefined
            ? { fidelizacionConfig: fidelizacion }
            : {}),
        },
      });
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
    const config = await this.identidad(e);
    const productos = await this.prisma.producto.findMany({
      where: { empresaId: e.id, activo: true, categoria: { activo: true } },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        precio: true,
        imagen: true,
        disponible: true,
        stockActual: true,
        ventaGranel: true,
        unidadGranel: true,
        categoriaId: true,
        aceptaAdicionales: true,
        categoria: { select: { nombre: true, categoriaPadre: { select: { nombre: true } } } },
        presentaciones: { where: { activo: true }, select: { id: true, nombre: true, precio: true }, orderBy: { orden: 'asc' } },
        adicionales: { select: { adicional: { select: { id: true, nombre: true, precio: true, activo: true, disponible: true, empaqueParaLlevar: true } } } },
      },
      orderBy: { nombre: 'asc' },
    });
    const restaurante = e.tipoNegocio === 'RESTAURANTE';
    const globales = restaurante
      ? await this.prisma.adicional.findMany({ where: { empresaId: e.id, activo: true, disponible: true, empaqueParaLlevar: false }, include: { ingrediente: true } })
      : [];
    const resenas = config.resenasHabilitadas && this.experiencia ? await this.experiencia.resenasPublicas(e.id) : [];
    return {
      nombre: e.nombre,
      logo: e.logo,
      direccion: e.direccion,
      telefono: e.telefono,
      legal: {
        razonSocial: config.razonSocial || '',
        nit: config.mostrarNit ? e.nit : '',
        correo: config.correoPublico || '',
      },
      config: {
        ...config,
        testimonios: config.testimonios.filter(t=>t.autorizado),
        fichasProductos: config.fichasProductos.filter(f=>productos.some(p=>p.id===f.productoId)),
        destacadosIds: config.destacadosIds.filter(id=>productos.some(p=>p.id===id)),
        novedadesIds: config.novedadesIds.filter(id=>productos.some(p=>p.id===id)),
        promociones: config.promociones.filter(v=>!v.productoId||productos.some(p=>p.id===v.productoId)),
      },
      bold: { habilitado: await this.bold.disponible({ empresaId: e.id, sucursalId: config.sucursalId }) },
      avisos: config.avisosClientes && this.experiencia ? this.experiencia.canalesDisponibles() : { whatsapp: false, correo: false },
      resenas: resenas.filter((x) => productos.some((p) => p.id === x.productoId)),
      productos: productos.map(({ adicionales, aceptaAdicionales, categoria, presentaciones, ...p }) => {
        const opciones = adicionalesDeProducto({ ...p, adicionales: adicionales || [], aceptaAdicionales, categoria }, globales, e.id, restaurante);
        // Solo se publican opciones existentes; un producto sin opciones conserva su forma anterior.
        return agregarOrigen({
          ...p,
          categoria: { nombre: categoria.nombre },
          ...(presentaciones?.length ? { presentaciones: presentaciones.map((x) => ({ id: x.id, nombre: x.nombre, precio: Number(x.precio) })) } : {}),
          ...(opciones.length ? { adicionales: opciones } : {}),
        }, leerOrigenes(e.tiendaConfig));
      }),
    };
  }

  async solicitar(slug: string, body: any, autorizacion?: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Pedido inválido');
    const e = await this.empresaPublica(slug);
    const t = tiendaConfig(e.tiendaConfig);
    const ahora = ahoraColombia();
    // Una mesa con QR puede pedir aunque la tienda no reciba domicilios.
    const entrega = validarEntrega(body, t, ahora, (n, token) => mesaValida(e.id, n, token));
    if (entrega.tipo !== 'MESA' && !t.pedidosHabilitados)
      throw new BadRequestException('La tienda no recibe pedidos por ahora');
    const clave = texto(body.clave, 'Identificador', 80, true);
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(clave))
      throw new BadRequestException('Identificador inválido');
    const existente = await this.prisma.pedidoWeb.findUnique({
      where: { empresaId_clave: { empresaId: e.id, clave } },
    });
    if (existente)
      return { id: existente.id, estado: existente.estado, total: existente.total, subtotal: existente.subtotal, costoDomicilio: existente.costoDomicilio, items: existente.items, descuento: descuentoPedido(existente) };
    const nombre = texto(body.nombre, 'Nombre', 100, true),
      telefono = texto(body.telefono, 'Teléfono', 20, true);
    if (!/^[+\d\s()-]{7,20}$/.test(telefono))
      throw new BadRequestException('Teléfono inválido');
    let direccion: string, zonaTexto: string, costoDomicilio: number;
    if (entrega.tipo === 'DOMICILIO') {
      direccion = texto(body.direccion, 'Dirección', 300, true);
      const candidatas = t.zonas.filter(z => z.id === body.zona || z.nombre === body.zona || (z.nombre === 'Todas las zonas' && z.ciudad?.toUpperCase() === String(body.zona).toUpperCase()));
      const zona = t.zonas.find(z => z.id === body.zona) || (candidatas.length === 1 ? candidatas[0] : candidatas.find(z => z.ciudad === body.ciudad));
      if (!zona)
        throw new BadRequestException(
          'Seleccione una zona atendida por la empresa',
        );
      if (body.ciudad !== undefined && zona.ciudad !== body.ciudad) throw new BadRequestException('La zona no pertenece a la ciudad seleccionada');
      zonaTexto = zona.ciudad ? `${zona.ciudad} · ${zona.nombre}` : zona.nombre;
      costoDomicilio = zona.costo;
    } else if (entrega.tipo === 'RECOGER') {
      direccion = 'Recoge en la tienda';
      zonaTexto = 'Recoger en tienda';
      costoDomicilio = 0;
    } else {
      direccion = `Mesa ${entrega.mesa}`;
      zonaTexto = `Mesa ${entrega.mesa}`;
      costoDomicilio = 0;
    }
    const etiquetas = [
      entrega.tipo === 'RECOGER' ? '[RECOGER EN TIENDA]' : entrega.tipo === 'MESA' ? `[MESA ${entrega.mesa}]` : '',
      entrega.programado ? `[PROGRAMADO ${entrega.programado.fecha} ${entrega.programado.hora}]` : '',
    ].filter(Boolean).join(' ');
    const observacion = [etiquetas, texto(body.observacion ?? '', 'Observaciones', 500)].filter(Boolean).join(' ').slice(0, 600);
    if (
      !(await this.prisma.sucursal.findFirst({
        where: { id: t.sucursalId, empresaId: e.id, activo: true },
      }))
    )
      throw new BadRequestException('Sucursal no disponible');
    const lineas = validarLineas(body.items);
    if (
      !['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'TARJETA'].includes(
        body.metodoPago,
      )
    )
      throw new BadRequestException('Medio de pago inválido');
    if (body.metodoPago === 'TARJETA' && (body.pagoBold !== true || !(await this.bold.disponible({ empresaId: e.id, sucursalId: t.sucursalId }))))
      throw new BadRequestException('Los pagos Bold no están habilitados para esta tienda');
    const ids = [...new Set(lineas.map((l) => l.productoId))];
    const productos = await this.prisma.producto.findMany({
      where: {
        empresaId: e.id,
        id: { in: ids },
        activo: true,
        disponible: true,
        categoria: { activo: true },
      },
      include: {
        categoria: { select: { nombre: true, categoriaPadre: { select: { nombre: true } } } },
        presentaciones: { where: { activo: true } },
        adicionales: { include: { adicional: { include: { ingrediente: true } } } },
      },
    });
    if (productos.length !== ids.length)
      throw new BadRequestException(
        'Un producto ya no está disponible. Actualice el catálogo.',
      );
    const restaurante = e.tipoNegocio === 'RESTAURANTE';
    const globales = restaurante && lineas.some((l) => l.adicionales.length)
      ? await this.prisma.adicional.findMany({ where: { empresaId: e.id, activo: true, disponible: true, empaqueParaLlevar: false }, include: { ingrediente: true } })
      : [];
    const unidades = new Map<number, number>();
    const items = lineas.map((l) => {
      const p = productos.find((p) => p.id === l.productoId)!;
      const presentacion = l.presentacionId ? p.presentaciones.find((x) => x.id === l.presentacionId) : null;
      if (l.presentacionId && !presentacion)
        throw new BadRequestException(`La presentación elegida de ${p.nombre} ya no está disponible. Actualice el catálogo.`);
      const permitidos = adicionalesDeProducto(p, globales, e.id, restaurante);
      const adicionales = l.adicionales.map((a) => {
        const ad = permitidos.find((x) => x.id === a.adicionalId);
        if (!ad) throw new BadRequestException(`Un adicional de ${p.nombre} ya no está disponible. Actualice el catálogo.`);
        return { adicionalId: ad.id, nombre: ad.nombre, precio: ad.precio, cantidad: a.cantidad };
      });
      unidades.set(p.id, (unidades.get(p.id) || 0) + l.cantidad * (presentacion?.factorUnidades || 1));
      if (!Number.isFinite(Number(p.stockActual)) || Number(p.stockActual) < unidades.get(p.id)!)
        throw new BadRequestException(`Existencias insuficientes de ${p.nombre}. Actualice el catálogo.`);
      const precio = presentacion ? Number(presentacion.precio) : Number(p.precio);
      const precioUnitario = Math.round((precio + adicionales.reduce((s, a) => s + a.precio * a.cantidad, 0)) * 100) / 100;
      return {
        productoId: p.id,
        nombre: presentacion ? `${p.nombre} · ${presentacion.nombre}` : p.nombre,
        cantidad: l.cantidad,
        precio,
        precioUnitario,
        ...(presentacion ? { presentacionId: presentacion.id } : {}),
        ...(adicionales.length ? { adicionales } : {}),
        ...(l.observacion ? { observacion: l.observacion } : {}),
      };
    });
    const subtotal = Math.round(items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0) * 100) / 100;
    // El pedido mínimo aplica a domicilios; recoger y mesa no pagan envío.
    if (entrega.tipo === 'DOMICILIO' && subtotal < t.minimo)
      throw new BadRequestException(`La compra mínima es $${t.minimo}`);
    // El cupón solo descuenta productos; se valida de nuevo dentro de la transacción.
    if (body.cupon !== undefined && body.cupon !== '' && !this.extras)
      throw new BadRequestException('Cupón no válido');
    const cupon = body.cupon ? await this.extras!.calcularCupon(e.id, body.cupon, subtotal) : null;
    const descuento = cupon?.descuento || 0;
    const canje = body.puntos !== undefined && body.puntos !== 0 && t.cuentasHabilitadas && this.experiencia
      ? await this.experiencia.calcularCanje(slug, e, autorizacion, body.puntos, subtotal - descuento)
      : null;
    if (body.puntos && !canje) throw new BadRequestException('El canje de puntos no está disponible');
    const total = Math.round((subtotal - descuento - (canje?.valor || 0) + costoDomicilio) * 100) / 100;
    monto(total, 'Total del pedido', 0, 99999999.99);
    if (body.metodoPago === 'TARJETA') montoBold(total);
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
    const cuenta = t.cuentasHabilitadas && this.extras
      ? await this.extras.clienteOpcional(slug, e.id, autorizacion)
      : null;
    // Avisos solo con autorización expresa del comprador y si la tienda los activó.
    const avisos = t.avisosClientes && this.experiencia && body.avisos && typeof body.avisos === 'object'
      ? {
          whatsapp: body.avisos.whatsapp === true,
          correo: this.experiencia.validarCorreoAviso(body.avisos.correo) || cuenta?.c.correo || '',
        }
      : null;
    const conAvisos = avisos && (avisos.whatsapp || avisos.correo) ? avisos : null;
    const crear = (db: any) => db.pedidoWeb.create({
        data: {
          empresaId: e.id,
          sucursalId: t.sucursalId,
          clave,
          nombre,
          telefono,
          direccion,
          zona: zonaTexto,
          observacion,
          items,
          subtotal,
          costoDomicilio,
          total,
          metodoPago: body.metodoPago,
        },
      });
    try {
      const pedido = cupon || cuenta || canje || conAvisos
        ? await this.prisma.$transaction(async (tx) => {
            const p = await crear(tx);
            if (cupon) {
              const vigente = await this.extras!.calcularCupon(e.id, body.cupon, subtotal, tx);
              if (vigente.descuento !== descuento)
                throw new ConflictException('El cupón cambió. Vuelve a aplicarlo antes de confirmar.');
              await this.extras!.aplicarCupon(vigente.r, p.id, descuento, tx);
            }
            if (cuenta) await this.extras!.vincularPedido(e.id, cuenta.r.id, p.id, tx);
            if (canje) await this.experiencia!.registrarCanje(e.id, p.id, canje, tx);
            if (conAvisos) await this.experiencia!.registrarAvisoPedido(e.id, p.id, conAvisos, tx);
            return p;
          }, { timeout: 15000 })
        : await crear(this.prisma);
      return { id: pedido.id, estado: pedido.estado, total: pedido.total, subtotal: pedido.subtotal, costoDomicilio: pedido.costoDomicilio, items: pedido.items, descuento: descuento + (canje?.valor || 0) };
    } catch (err) {
      if (err.code === 'P2002') {
        const p = await this.prisma.pedidoWeb.findUniqueOrThrow({
          where: { empresaId_clave: { empresaId: e.id, clave } },
        });
        return { id: p.id, estado: p.estado, total: p.total, subtotal: p.subtotal, costoDomicilio: p.costoDomicilio, items: p.items, descuento: descuentoPedido(p) };
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
        subtotal: true, costoDomicilio: true, items: true,
        motivo: true,
        pedido: { select: { numero: true, estado: true } },
      },
    });
    if (!p) throw new NotFoundException('Pedido no encontrado');
    const registro = await this.prisma.pedidoWeb.findFirst({ where: { id, empresaId: e.id } });
    return { ...p, descuento: descuentoPedido(p), pagoBold: await this.bold.estado(registro) };
  }
  async pagoBold(slug: string, id: string, clave: unknown) {
    const e = await this.empresaPublica(slug);
    const p = await this.prisma.pedidoWeb.findFirst({ where: { id, empresaId: e.id } });
    if (!p) throw new NotFoundException('Pedido no encontrado');
    return this.bold.intento(p, clave, slug);
  }
  async webhookBold(slug: string, raw: Buffer, firma: unknown) {
    // Mantener recepción de cobros previos aunque la tienda deje de estar publicada.
    const e = await this.prisma.empresa.findUnique({ where: { tiendaSlug: slug } });
    if (!e) throw new NotFoundException('Tienda no encontrada');
    return this.bold.webhook({ empresaId: e.id, sucursalId: tiendaConfig(e.tiendaConfig).sucursalId }, raw, firma);
  }
  async listar(user: any) {
    const pedidos = await this.prisma.pedidoWeb.findMany({
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
    return Promise.all(pedidos.map(async p => ({ ...p, descuento: descuentoPedido(p), pagoBold: await this.bold.estado(p) })));
  }
  repartidores(user: any) {
    return this.prisma.usuario.findMany({
      where: { empresaId: user.empresaId, activo: true, rol: 'DOMICILIARIO' },
      select: { id: true, nombre: true },
    });
  }
  async gestionar(id: string, body: any, user: any) {
    // Fuera de la transacción: una sede sin la tabla de registros no invalida la venta.
    const previo = this.experiencia ? await this.experiencia.datosPedido(user.empresaId, id) : null;
    const resultado = await this.prisma.$transaction(
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
          const pago = p.metodoPago === 'TARJETA' ? await this.bold.verificarParaVenta(p, tx) : null;
          const items = p.items as any[];
          const prods = await tx.producto.findMany({
            where: {
              empresaId: user.empresaId,
              id: { in: items.map((i) => i.productoId) },
              activo: true,
              disponible: true,
            },
            include: { presentaciones: { where: { activo: true } } },
          });
          // El precio base (producto o presentación) debe seguir igual; los adicionales los valida la venta.
          if (
            items.some(
              (i) =>
                !prods.some(
                  (prod) =>
                    prod.id === i.productoId &&
                    Number(i.presentacionId ? prod.presentaciones?.find((x) => x.id === i.presentacionId)?.precio : prod.precio) === i.precio,
                ),
            )
          )
            throw new ConflictException(
              'Cambió el catálogo. Contacte al cliente antes de solicitar un nuevo pedido.',
            );
          // Solo se consulta el cupón si el pedido tiene descuento: así una sede sin la tabla
          // de registros no invalida la transacción de la venta.
          const descuento = descuentoPedido(p);
          const uso = previo ? previo.cupon : descuento > 0 ? await this.extras?.usoCupon(user.empresaId, p.id, tx) : null;
          const canje = previo?.canje || null;
          if (Math.abs((uso?.descuento || 0) + (canje?.valor || 0) - descuento) > 0.009)
            throw new ConflictException('No se pudo verificar el descuento de este pedido. Contacta a soporte antes de aceptarlo.');
          // No vincular por teléfono a un cliente existente: el comprador público no autenticó su identidad.
          const venta = await this.pedidos.crearEnTransaccion(
            {
              items,
              metodoPago: pago?.metodo || p.metodoPago,
              sucursalId: p.sucursalId,
              // El canje usa el cliente vinculado; si no, el elegido por caja o el de la cuenta web.
              clienteId: canje?.clientePosId || body.clienteId || previo?.clientePosId || null,
              ...(uso ? { descuento: uso.descuento } : {}),
              ...(canje ? { puntosCanjeados: canje.puntos } : {}),
              observacion: `DOMICILIO: ${p.nombre} · ${p.telefono} · ${p.direccion}.${uso ? ` CUPÓN ${uso.codigo}.` : ''} ${p.observacion || ''}`,
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
          if (pago) await this.bold.aplicar(pago.registro, venta.id, tx);
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
          await this.bold.validarRechazo(p, tx);
          if (descuentoPedido(p) > 0) await this.extras?.liberarCupon(user.empresaId, p.id, tx);
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
          // Recoger en tienda y mesa no pasan por domiciliario.
          const local = p.zona === 'Recoger en tienda' || p.zona.startsWith('Mesa ');
          if (p.estado !== 'EN_CAMINO' && !(local && p.estado === 'ACEPTADO' && user.rol !== 'DOMICILIARIO'))
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
    if (this.experiencia) void this.experiencia.avisarPedido(user.empresaId, resultado);
    return resultado;
  }
}
