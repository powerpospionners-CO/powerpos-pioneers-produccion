import { BadRequestException } from '@nestjs/common';
import { datosContrato, secciones } from './contrato-editor.reglas';
import { claveCargo, validarCargoPlantilla } from './perfiles-cargo';
import { hoy, texto } from './personal.reglas';

export const TIPOS_CONTRATO = ['INDEFINIDO', 'FIJO', 'OBRA_LABOR'];
const comunes = [
  {
    titulo: 'Prestación personal y funciones',
    contenido:
      'La persona trabajadora {{empleado}}, identificada con {{documento}}, desempeñará el cargo de {{cargo}} para {{empresa}}, NIT {{nit}}, en el lugar y con las funciones descritas en este contrato. Las instrucciones del empleador deberán ser legítimas, compatibles con el cargo y respetar su dignidad y derechos.',
  },
  {
    titulo: 'Salario, auxilios y comprobantes',
    contenido:
      'El salario básico pactado es el indicado en la sección de remuneración. El auxilio de transporte o su sustituto legal se reconocerá separadamente cuando corresponda. Se entregarán comprobantes que distingan devengados, deducciones legales y valor neto. El salario se ajustará para respetar el mínimo legal aplicable; las prestaciones, aportes y recargos no se entienden incluidos en el salario ordinario.',
  },
  {
    titulo: 'Jornada, descansos y trabajo adicional',
    contenido:
      'La jornada y los descansos serán los expresamente descritos en este contrato, dentro de los límites legales. Los descansos no computados como trabajo deberán ser reales y libres de funciones. Se registrarán y pagarán las horas extras, el trabajo nocturno y en días de descanso obligatorio o festivos según las normas vigentes. La ausencia de autorización previa no permitirá desconocer trabajo ordenado, permitido o conocido por el empleador.',
  },
  {
    titulo: 'Seguridad social, prestaciones y vacaciones',
    contenido:
      'Desde el inicio real de la relación se reconocerán afiliaciones, aportes a salud, pensión, riesgos laborales y caja de compensación, y los demás aportes exigibles. Se practicarán únicamente las deducciones legales o válidamente autorizadas. Se liquidarán y pagarán cesantías, sus intereses, prima de servicios y vacaciones conforme a sus bases, plazos y proporciones, así como la dotación cuando proceda. Este contrato no sustituye los soportes de afiliación, pago o consignación.',
  },
  {
    titulo: 'Seguridad y salud en el trabajo',
    contenido:
      'El empleador proporcionará condiciones seguras, información, capacitación y elementos de protección adecuados. La persona trabajadora seguirá las instrucciones legítimas de prevención y reportará riesgos y novedades. Las tareas de limpieza u otras actividades se realizarán con medidas apropiadas de seguridad.',
  },
  {
    titulo: 'Custodia y descuentos',
    contenido:
      'Los bienes y valores recibidos se manejarán diligentemente y se reportarán diferencias. Los faltantes de caja, pérdidas o daños no generan descuentos automáticos ni una autorización general de descuento. Cualquier investigación, medida o deducción respetará los requisitos legales y el debido proceso.',
  },
  {
    titulo: 'Privacidad y confidencialidad',
    contenido:
      'El empleador informará su política de tratamiento de datos y gestionará por separado las autorizaciones exigibles, especialmente respecto de datos sensibles. El acceso se limitará a finalidades laborales legítimas. La persona trabajadora protegerá la información reservada conocida por sus funciones, sin impedir denuncias, defensa de derechos ni comunicaciones legítimas con autoridades.',
  },
  {
    titulo: 'Continuidad y derechos causados',
    contenido:
      'Se reconoce la fecha real de ingreso indicada en este documento. Su elaboración y sus firmas conservarán sus fechas reales. Este documento no reinicia antigüedad, no establece un período de prueba retroactivo, no liquida vínculos anteriores ni constituye paz y salvo, renuncia o compensación general de derechos. Las diferencias históricas deberán revisarse y pagarse según corresponda.',
  },
  {
    titulo: 'Firma electrónica y copia',
    contenido:
      'La firma electrónica se realizará mediante el mecanismo de identificación y verificación habilitado, después de permitir la lectura del original completo. Cada firmante aceptará exclusivamente ese documento. Se conservarán sus evidencias, fecha y huella de integridad y se entregará copia al trabajador. Podrá solicitarse una alternativa en papel; la recepción de un enlace no equivale a firma.',
  },
];
export const TERMINACION: Record<string, string> = {
  INDEFINIDO:
    'El vínculo no tiene fecha final y subsiste mientras permanezcan las causas que le dieron origen y la materia del trabajo. Su terminación se sujetará a las causas, procedimientos, protecciones e indemnizaciones legales. El preaviso de la persona trabajadora se regirá por la ley, sin sanciones pactadas por su omisión.',
  FIJO: 'El plazo será el expresamente indicado por escrito. Sus prórrogas y renovaciones se sujetan a la ley y al límite máximo acumulado de cuatro años aplicable. La intención de no renovar deberá comunicarse con la antelación legal de treinta días cuando corresponda. La terminación no excluye prestaciones proporcionales, protecciones especiales ni indemnizaciones procedentes. No se convierte retroactivamente una relación indefinida en una relación a término fijo.',
  OBRA_LABOR:
    'La duración se limita a la ejecución de la obra o labor precisa y detallada identificada en este contrato. No se sustituye esa descripción por el nombre del cargo ni se pacta una duración indefinida bajo esta modalidad. La finalización deberá corresponder a la terminación real y comprobable de la actividad contratada, respetando prestaciones proporcionales y protecciones legales. La continuación de servicios o una nueva obra se tratarán conforme a la ley; no se convierte retroactivamente una relación indefinida.',
};
export function baseModalidad(tipo: string) {
  if (!TIPOS_CONTRATO.includes(tipo))
    throw new BadRequestException('Selecciona indefinido, fijo u obra o labor');
  return {
    tipo,
    nombre:
      tipo === 'INDEFINIDO'
        ? 'Contrato a término indefinido'
        : tipo === 'FIJO'
          ? 'Contrato a término fijo'
          : 'Contrato por obra o labor determinada',
    terminacion: TERMINACION[tipo],
    clausulas: comunes.map((c) => ({ ...c })),
    anexos: [],
  };
}
export function condicionesPlantilla(d: any) {
  const base = baseModalidad(d.tipo);
  // Valida las condiciones reutilizables con los mismos límites del editor, sin guardar una identidad de empleado ficticia.
  const valido = datosContrato({
    ...d,
    tipo: 'INDEFINIDO',
    empleadoId: 'plantilla',
    inicio: hoy(),
    fechaCelebracion: hoy(),
    domicilioEmpleado: 'Se toma del expediente',
    cargo: 'Se toma del expediente',
    salario: '1',
    frecuencia: 'QUINCENAL',
    especieMonto: '0',
    especieDetalle: '',
    funciones: d.funciones || 'Se toman del expediente del empleado.',
    terminacion: d.terminacion || base.terminacion,
    clausulas: d.clausulas || base.clausulas,
    anexos: d.anexos || [],
  });
  const pendientes = (v: unknown): boolean =>
    typeof v === 'string'
      ? /\[[^\]]+\]/.test(v)
      : Array.isArray(v)
        ? v.some(pendientes)
        : !!v && typeof v === 'object'
          ? Object.values(v).some(pendientes)
          : false;
  if (pendientes(valido))
    throw new BadRequestException(
      'Completa los campos pendientes de la plantilla',
    );
  return {
    tipo: base.tipo,
    perfilCargo: d.perfilCargo
      ? texto(d.perfilCargo, 'cargo de la plantilla', 200)
      : null,
    perfilCargoClave: d.perfilCargo
      ? claveCargo(texto(d.perfilCargo, 'cargo de la plantilla', 200))
      : '',
    nombre: texto(d.nombre || base.nombre, 'nombre de plantilla', 200),
    razonSocial: texto(d.razonSocial, 'razón social legal', 300),
    domicilioEmpresa: valido.domicilioEmpresa,
    lugarCelebracion: valido.lugarCelebracion,
    lugarContratacion: valido.lugarContratacion,
    lugarServicio: valido.lugarServicio,
    formaPago: valido.formaPago,
    jornada: valido.jornada,
    descansos: valido.descansos,
    funciones: d.funciones ? valido.funciones : '',
    terminacion: valido.terminacion,
    clausulas: secciones(valido.clausulas, 'cláusulas'),
    anexos: valido.anexos,
  };
}
export function completarContrato(plantilla: any, empleado: any, d: any) {
  const tipo = plantilla.tipo;
  baseModalidad(tipo);
  if (!empleado.activo)
    throw new BadRequestException('El empleado está retirado');
  if (tipo !== 'INDEFINIDO' && empleado.ingreso < hoy())
    throw new BadRequestException(
      'Para una relación ya iniciada, el término fijo u obra requiere revisión individual en el editor; no se convierte retroactivamente una relación laboral',
    );
  if (
    tipo === 'OBRA_LABOR' &&
    (typeof d.obra !== 'string' || d.obra.trim().length < 30)
  )
    throw new BadRequestException(
      'Describe de forma precisa la obra o labor y cómo se determina su terminación (mínimo 30 caracteres)',
    );
  if (tipo === 'FIJO') {
    const limite = new Date(empleado.ingreso);
    limite.setUTCFullYear(limite.getUTCFullYear() + 4);
    if (
      typeof d.fin !== 'string' ||
      d.fin < empleado.ingreso ||
      Date.parse(d.fin) > limite.getTime()
    )
      throw new BadRequestException(
        'El término fijo requiere fecha final válida y no puede superar cuatro años; las prórrogas también se revisan al emitir',
      );
  }
  validarCargoPlantilla(plantilla, empleado, d);
  return {
    ...plantilla,
    empleadoId: d.empleadoId,
    tipo,
    inicio: empleado.ingreso,
    fechaCelebracion: hoy(),
    domicilioEmpleado: texto(
      empleado.domicilio,
      'domicilio del empleado en su expediente',
      500,
    ),
    cargo: empleado.cargo,
    funciones: empleado.funciones || plantilla.funciones,
    lugarServicio: empleado.lugarServicio || plantilla.lugarServicio,
    salario: String(empleado.salarioCentavos / 100),
    frecuencia: empleado.frecuencia,
    especieMonto: '0',
    especieDetalle: '',
    fin: tipo === 'FIJO' ? d.fin : undefined,
    obra: tipo === 'OBRA_LABOR' ? d.obra : undefined,
  };
}
