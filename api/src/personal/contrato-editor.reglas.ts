import { BadRequestException } from '@nestjs/common';
import { centavos, fecha, hoy, texto } from './personal.reglas';
export const CLAUSULAS_GUIA = [
  {
    titulo: 'Prestaciones y seguridad social',
    contenido:
      'El empleador reconocerá las prestaciones, afiliaciones y aportes que correspondan conforme al régimen legal aplicable. Este documento no sustituye afiliaciones, planillas ni liquidaciones.',
  },
  {
    titulo: 'Derechos mínimos y diferencias',
    contenido:
      'Ninguna estipulación constituye renuncia a derechos mínimos laborales. Las partes podrán presentar y tramitar diferencias por los canales legales aplicables.',
  },
];
export function secciones(valor: any, campo: string, max = 30) {
  if (!Array.isArray(valor) || valor.length > max)
    throw new BadRequestException(`Revisa ${campo}`);
  return valor.map((c) => ({
    titulo: texto(c.titulo, `título de ${campo}`, 150),
    contenido: texto(c.contenido, `contenido de ${campo}`, 4000),
  }));
}
export function datosContrato(d: any) {
  if (!['INDEFINIDO', 'FIJO', 'OBRA_LABOR'].includes(d.tipo))
    throw new BadRequestException('Selecciona una modalidad laboral');
  const inicio = fecha(d.inicio),
    fin = d.tipo === 'FIJO' ? fecha(d.fin) : null;
  if (fin && fin < inicio)
    throw new BadRequestException('El fin no puede ser anterior al inicio');
  const salarioCentavos = centavos(d.salario),
    especieCentavos = centavos(d.especieMonto || '0');
  if (salarioCentavos <= 0)
    throw new BadRequestException('El salario debe ser positivo');
  if (especieCentavos > Math.floor(salarioCentavos / 2))
    throw new BadRequestException(
      'El salario en especie no puede exceder el 50 % del total; el límite más restrictivo aplicable al salario mínimo requiere revisión',
    );
  if (!['SEMANAL', 'QUINCENAL', 'MENSUAL'].includes(d.frecuencia))
    throw new BadRequestException('Revisa la periodicidad de pago');
  const clausulas = secciones(d.clausulas || [], 'cláusulas'),
    anexos = secciones(d.anexos || [], 'anexos', 10);
  if (JSON.stringify({ clausulas, anexos }).length > 50000)
    throw new BadRequestException(
      'El texto del contrato excede 50.000 caracteres',
    );
  return {
    empleadoId: texto(d.empleadoId, 'empleado', 36),
    tipo: d.tipo,
    inicio,
    fin,
    obra:
      d.tipo === 'OBRA_LABOR'
        ? texto(d.obra, 'obra o labor específica', 3000)
        : null,
    domicilioEmpleado: texto(
      d.domicilioEmpleado,
      'domicilio del empleado',
      500,
    ),
    domicilioEmpresa: texto(d.domicilioEmpresa, 'domicilio del empleador', 500),
    lugarCelebracion: texto(d.lugarCelebracion, 'lugar de celebración', 300),
    lugarContratacion: texto(d.lugarContratacion, 'lugar de contratación', 300),
    lugarServicio: texto(
      d.lugarServicio,
      'lugar de prestación del servicio',
      500,
    ),
    cargo: texto(d.cargo, 'cargo', 200),
    funciones: texto(d.funciones, 'naturaleza y funciones del trabajo', 4000),
    salarioCentavos,
    frecuencia: d.frecuencia,
    formaPago: texto(d.formaPago, 'forma de pago', 1000),
    jornada: texto(d.jornada, 'jornada y distribución del horario', 2000),
    descansos: texto(d.descansos, 'descansos y turnos', 2000),
    especieCentavos,
    especieDetalle: especieCentavos
      ? texto(
          d.especieDetalle,
          'estimación y detalle del salario en especie',
          2000,
        )
      : 'No se pacta salario en especie.',
    terminacion: texto(d.terminacion, 'duración, preaviso y terminación', 3000),
    clausulas,
    anexos,
  };
}
export function variablesContrato(d: any) {
  return {
    empresa: d.empresa.nombre,
    nit: d.empresa.nit,
    empleado: d.empleado.nombre,
    documento: d.empleado.identificacion,
    cargo: d.cargo,
    salario: `COP ${(d.salarioCentavos / 100).toFixed(2)}`,
    inicio: d.inicio,
    fin: d.fin || 'No aplica',
    lugar: d.lugarServicio,
  };
}
export function resolverTexto(s: string, d: any) {
  const vars = variablesContrato(d);
  const r = s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key))
      throw new BadRequestException(`Variable no permitida: ${key}`);
    return String(vars[key as keyof typeof vars]);
  });
  if (r.includes('{{') || r.includes('}}'))
    throw new BadRequestException('Hay una variable incompleta en el contrato');
  return r;
}
export function revisionContrato(d: any) {
  if (d.acepta !== true)
    throw new BadRequestException(
      'Confirma la revisión jurídica de esta versión exacta',
    );
  const revisadaEn = fecha(d.revisadaEn);
  if (revisadaEn > hoy())
    throw new BadRequestException('La revisión no puede tener fecha futura');
  return {
    revisadaPor: texto(d.revisadaPor, 'responsable de revisión jurídica', 200),
    revisadaEn,
    alcance: texto(d.alcance, 'alcance de revisión', 3000),
  };
}
