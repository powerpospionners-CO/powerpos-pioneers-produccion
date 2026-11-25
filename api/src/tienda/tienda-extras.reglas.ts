import { BadRequestException } from '@nestjs/common';
import { texto } from './reglas';
import type { HorarioDia } from './horarios';

const fallo = (m: string): never => {
  throw new BadRequestException(m);
};

export type Cupon = {
  codigo: string;
  tipo: 'PORCENTAJE' | 'VALOR';
  valor: number;
  desde: string;
  hasta: string;
  minimo: number;
  maxUsos: number;
  usos: number;
  activo: boolean;
  descripcion: string;
};

export function fechaIso(v: unknown, campo: string) {
  const s = texto(v, campo, 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s
  )
    fallo(`${campo} inválida`);
  return s;
}

const entero = (v: unknown, campo: string, min: number, max: number) =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max
    ? (v as number)
    : fallo(`${campo} inválido`);

export function normalizarCodigo(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(s) ? s : '';
}

export function validarCuponAdmin(body: any, previo?: Cupon): Cupon {
  if (!body || typeof body !== 'object') fallo('Cupón inválido');
  const codigo = normalizarCodigo(body.codigo);
  if (!codigo)
    fallo('El código debe tener de 3 a 24 letras, números, guiones o guion bajo');
  if (!['PORCENTAJE', 'VALOR'].includes(body.tipo)) fallo('Tipo de cupón inválido');
  const valor = Number(body.valor);
  if (
    !Number.isFinite(valor) ||
    valor <= 0 ||
    (body.tipo === 'PORCENTAJE'
      ? valor > 90 || !Number.isInteger(valor)
      : valor > 10000000 || Math.round(valor * 100) !== valor * 100)
  )
    fallo(
      body.tipo === 'PORCENTAJE'
        ? 'El porcentaje debe ser un número entero entre 1 y 90'
        : 'Valor del descuento inválido',
    );
  const desde = fechaIso(body.desde, 'Fecha de inicio'),
    hasta = fechaIso(body.hasta, 'Fecha de fin');
  if (hasta < desde) fallo('El cupón debe terminar después de su inicio');
  const minimo = Number(body.minimo ?? 0);
  if (!Number.isFinite(minimo) || minimo < 0 || minimo > 100000000)
    fallo('Compra mínima inválida');
  const maxUsos = entero(body.maxUsos ?? 0, 'Límite de usos', 0, 1000000);
  if (typeof body.activo !== 'boolean') fallo('Estado del cupón inválido');
  const usos = previo?.usos ?? 0;
  if (maxUsos && maxUsos < usos)
    fallo(`El cupón ya se usó ${usos} veces; el límite no puede ser menor`);
  return {
    codigo,
    tipo: body.tipo,
    valor,
    desde,
    hasta,
    minimo,
    maxUsos,
    usos,
    activo: body.activo,
    descripcion: texto(body.descripcion ?? '', 'Descripción', 200),
  };
}

// Solo sobre productos; el domicilio no se descuenta. Nunca supera el subtotal.
export function descuentoCupon(c: Cupon, subtotal: number, hoy: string) {
  if (!c.activo || hoy < c.desde || hoy > c.hasta)
    fallo('El cupón no está vigente');
  if (c.maxUsos && c.usos >= c.maxUsos) fallo('El cupón ya alcanzó su límite de usos');
  if (subtotal < c.minimo)
    fallo(`Este cupón aplica en compras desde $${c.minimo.toLocaleString('es-CO')}`);
  const bruto = c.tipo === 'PORCENTAJE' ? (subtotal * c.valor) / 100 : c.valor;
  return Math.min(subtotal, Math.round(bruto * 100) / 100);
}

export function normalizarCorreo(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
}

export function normalizarTelefono(v: unknown) {
  const s = typeof v === 'string' ? v.replace(/[\s()-]/g, '') : '';
  return /^\+?\d{7,15}$/.test(s) ? s : '';
}

export function validarContrasena(v: unknown) {
  if (typeof v !== 'string' || v.length < 10 || v.length > 128)
    fallo('La contraseña debe tener entre 10 y 128 caracteres');
  const s = v as string;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s) || !/\d/.test(s))
    fallo('La contraseña debe combinar letras y números');
  if (/^(.)\1+$/.test(s) || /^(0123456789|1234567890|contrase[ñn]a\d*|password\d*)$/i.test(s))
    fallo('Elige una contraseña menos predecible');
  return s;
}

// Campo trampa invisible: las personas lo dejan vacío; muchos bots lo llenan.
export function rechazarBot(body: any) {
  if (body && typeof body.sitio === 'string' && body.sitio.trim())
    fallo('No fue posible procesar la solicitud');
}

export function exigirConsentimiento(body: any) {
  if (body?.consentimiento !== true)
    fallo('Debes autorizar el tratamiento de tus datos para continuar');
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

export function validarReserva(
  body: any,
  config: { reservaMaxPersonas: number; reservaDiasMax: number; horarios: HorarioDia[] | null },
  ahora: { fecha: string; minutos: number },
) {
  rechazarBot(body);
  exigirConsentimiento(body);
  const nombre = texto(body.nombre, 'Nombre', 100, true);
  const telefono = normalizarTelefono(body.telefono);
  if (!telefono) fallo('Teléfono inválido');
  const correo = body.correo ? normalizarCorreo(body.correo) : '';
  if (body.correo && !correo) fallo('Correo inválido');
  const fecha = fechaIso(body.fecha, 'Fecha');
  const hora = texto(body.hora, 'Hora', 5, true);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) fallo('Hora inválida');
  const personas = entero(body.personas, 'Número de personas', 1, config.reservaMaxPersonas);
  const limite = new Date(`${ahora.fecha}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + config.reservaDiasMax);
  if (fecha < ahora.fecha || (fecha === ahora.fecha && minutos(hora) <= ahora.minutos + 30))
    fallo('Elige una fecha y hora con al menos 30 minutos de anticipación');
  if (fecha > limite.toISOString().slice(0, 10))
    fallo(`Solo se reciben reservas hasta ${config.reservaDiasMax} días adelante`);
  if (config.horarios) {
    // Los horarios empiezan en lunes (0); getUTCDay empieza en domingo.
    const dia = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
    const h = config.horarios.find((x) => x.dia === dia);
    if (!h?.abierto) fallo('La tienda no atiende ese día');
    const inicio = minutos(h!.apertura),
      fin = minutos(h!.cierre),
      m = minutos(hora);
    const dentro = fin > inicio ? m >= inicio && m < fin : m >= inicio || m < fin;
    if (!dentro) fallo(`El horario de ese día es de ${h!.apertura} a ${h!.cierre}`);
  }
  return {
    nombre,
    telefono,
    correo,
    fecha,
    hora,
    personas,
    nota: texto(body.nota ?? '', 'Indicaciones', 300),
  };
}

export function ahoraColombia(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const v = (k: string) => p.find((x) => x.type === k)!.value;
  return {
    fecha: `${v('year')}-${v('month')}-${v('day')}`,
    minutos: Number(v('hour')) * 60 + Number(v('minute')),
  };
}

export function validarFunciones(t: any) {
  for (const campo of ['reservasHabilitadas', 'boletinHabilitado', 'cuentasHabilitadas'])
    if (typeof t[campo] !== 'boolean') fallo('Estado de funciones de la tienda inválido');
  return {
    reservasHabilitadas: t.reservasHabilitadas as boolean,
    reservaMaxPersonas: entero(t.reservaMaxPersonas, 'Máximo de personas por reserva', 1, 100),
    reservaDiasMax: entero(t.reservaDiasMax, 'Días de anticipación', 1, 180),
    boletinHabilitado: t.boletinHabilitado as boolean,
    cuentasHabilitadas: t.cuentasHabilitadas as boolean,
  };
}
