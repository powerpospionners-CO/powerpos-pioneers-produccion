/** Configuration foundation only. Production routing remains on PrismaService until cutover validation. */
export type DestinoSede = { empresaId: number; sucursalId: number; variable: string };
function identidadBase(valor: string) {
  const url = new URL(valor);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || (url.searchParams.get('schema') || 'public') !== 'public') throw new Error('La sede requiere una base PostgreSQL independiente con esquema public');
  return `${url.hostname.toLowerCase().replace('-pooler.', '.')}|${url.port || '5432'}|${decodeURIComponent(url.pathname)}`;
}
export class RegistroBasesSede {
  private readonly destinos = new Map<string, string>();
  constructor(configuracion: DestinoSede[], variables: Record<string, string | undefined>, baseControl: string) {
    const bases = new Set([identidadBase(baseControl)]);
    for (const sede of configuracion) {
      if (!Number.isSafeInteger(sede.empresaId) || sede.empresaId < 1 || !Number.isSafeInteger(sede.sucursalId) || sede.sucursalId < 1 || !/^[A-Z][A-Z0-9_]+$/.test(sede.variable)) throw new Error('Asignación de sede inválida');
      const clave = `${sede.empresaId}:${sede.sucursalId}`;
      const url = variables[sede.variable];
      if (!url) throw new Error('Falta la conexión de una sede');
      const identidad = identidadBase(url);
      if (this.destinos.has(clave) || bases.has(identidad)) throw new Error('Una sede no puede compartir su base con otra sede ni con el control');
      bases.add(identidad); this.destinos.set(clave, url);
    }
  }
  resolver(identidadAutenticada: { empresaId: number; sucursalId: number }) {
    const url = this.destinos.get(`${identidadAutenticada.empresaId}:${identidadAutenticada.sucursalId}`);
    if (!url) throw new Error('Sede sin base asignada: acceso bloqueado');
    return url;
  }
  verificarCobertura(sedesActivas: { empresaId: number; id: number }[]) {
    for (const sede of sedesActivas) this.resolver({ empresaId: sede.empresaId, sucursalId: sede.id });
  }
}
