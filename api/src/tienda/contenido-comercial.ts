import { BadRequestException } from '@nestjs/common';
import { texto } from './reglas';
const fallo = (mensaje: string): never => {
  throw new BadRequestException(mensaje);
};
const lista = (v: unknown, max: number): any[] =>
  Array.isArray(v) && v.length <= max
    ? v
    : fallo('Cantidad de elementos inválida');
const id = (v: unknown): number =>
  Number.isSafeInteger(v) && Number(v) > 0
    ? Number(v)
    : fallo('Producto inválido');
function fecha(v: unknown) {
  const s = texto(v, 'Fecha', 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    fallo('Fecha inválida');
  return s;
}
export function validarComercial(t: any) {
  const ids = (v: unknown) => [...new Set(lista(v, 8).map(id))];
  const destacadosIds = ids(t.destacadosIds),
    novedadesIds = ids(t.novedadesIds);
  const promociones = lista(t.promociones, 12).map((p) => {
    const desde = fecha(p?.desde),
      hasta = fecha(p?.hasta);
    if (hasta < desde) fallo('La promoción debe terminar después de su inicio');
    return {
      titulo: texto(p?.titulo, 'Título de promoción', 120, true),
      detalle: texto(p?.detalle, 'Condiciones de promoción', 2000, true),
      desde,
      hasta,
      productoId: p?.productoId == null ? null : id(p.productoId),
    };
  });
  const testimonios = lista(t.testimonios, 12).map((p) => {
    if (typeof p?.autorizado !== 'boolean')
      fallo('Confirme la autorización del testimonio');
    return {
      nombre: texto(p?.nombre, 'Nombre público', 100, true),
      texto: texto(p?.texto, 'Testimonio', 1000, true),
      autorizado: p.autorizado,
    };
  });
  if (
    !t.politicas ||
    typeof t.politicas !== 'object' ||
    Array.isArray(t.politicas)
  )
    fallo('Políticas inválidas');
  const politicas = Object.fromEntries(
    ['envios', 'cambios', 'devoluciones', 'privacidad', 'terminos'].map((k) => [
      k,
      texto(t.politicas[k] ?? '', `Política de ${k}`, 12000),
    ]),
  ) as {envios:string;cambios:string;devoluciones:string;privacidad:string;terminos:string};
  const fichasProductos = lista(t.fichasProductos, 300).map((p) => ({
    productoId: id(p?.productoId),
    imagenes: lista(p?.imagenes, 6).map((v) => {
      const url = texto(v, 'Foto de producto', 500, true);
      if (!/^https:\/\//i.test(url)) fallo('Las fotos deben usar HTTPS');
      return url;
    }),
  }));
  if (
    new Set(fichasProductos.map((p) => p.productoId)).size !==
    fichasProductos.length
  )
    fallo('No repita fichas de productos');
  return {
    destacadosIds,
    novedadesIds,
    promociones,
    testimonios,
    politicas,
    fichasProductos,
  };
}
export function productosComerciales(c: ReturnType<typeof validarComercial>) {
  return [
    ...new Set([
      ...c.destacadosIds,
      ...c.novedadesIds,
      ...c.promociones.flatMap((p) => (p.productoId ? [p.productoId] : [])),
      ...c.fichasProductos.map((p) => p.productoId),
    ]),
  ];
}
// Identidad legal visible y analítica opcional; el NIT solo se publica si la empresa lo autoriza.
export function validarSitio(t: any) {
  if (typeof t.mostrarNit !== 'boolean') fallo('Indique si desea publicar el NIT');
  const correoPublico = texto(t.correoPublico ?? '', 'Correo de atención', 200);
  if (correoPublico && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoPublico))
    fallo('Correo de atención inválido');
  const googleAnalyticsId = texto(t.googleAnalyticsId ?? '', 'Google Analytics', 20).toUpperCase();
  if (googleAnalyticsId && !/^G-[A-Z0-9]{4,15}$/.test(googleAnalyticsId))
    fallo('Use un ID de medición de Google Analytics con formato G-XXXXXXX');
  const metaPixelId = texto(t.metaPixelId ?? '', 'Meta Pixel', 20);
  if (metaPixelId && !/^\d{8,20}$/.test(metaPixelId))
    fallo('El ID de Meta Pixel debe contener solo números');
  return {
    razonSocial: texto(t.razonSocial ?? '', 'Razón social', 200),
    mostrarNit: t.mostrarNit,
    correoPublico,
    googleAnalyticsId,
    metaPixelId,
  };
}
