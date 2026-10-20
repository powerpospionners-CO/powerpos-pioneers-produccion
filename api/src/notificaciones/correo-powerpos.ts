import { join } from 'path';
import { escaparHtml } from './preferencias-alertas';

export type CorreoPowerpos = { html: string; text: string };
export const LOGO_CORREO_CID = 'marca@powerpospioneers.com';
export const logoCorreo = () => ({
  filename: 'powerpos.png',
  path: join(__dirname, 'assets', 'logo-powerpos.png'),
  cid: LOGO_CORREO_CID,
  contentType: 'image/png',
  contentDisposition: 'inline' as const,
});

type Estilo = 'atencion' | 'critico' | 'positivo' | 'celebracion';
const estilos = {
  atencion: {
    color: '#a94a08',
    fondo: '#fff4e8',
    borde: '#f4d5b2',
    etiqueta: 'AVISO OPERATIVO',
  },
  critico: {
    color: '#b42332',
    fondo: '#fff1f1',
    borde: '#f3c5ca',
    etiqueta: 'REQUIERE ATENCIÓN',
  },
  positivo: {
    color: '#14624c',
    fondo: '#eaf6f0',
    borde: '#bfe1cf',
    etiqueta: 'ACTUALIZACIÓN CONFIRMADA',
  },
  celebracion: {
    color: '#a94a08',
    fondo: '#fff4e8',
    borde: '#f4d5b2',
    etiqueta: 'HOY ES UN DÍA ESPECIAL',
  },
};

function plantilla(datos: {
  estilo: Estilo;
  titulo: string;
  introduccion: string;
  mensaje: string;
  contexto: Array<[string, string]>;
  accion?: boolean;
  pie?: string;
}): CorreoPowerpos {
  const estilo = estilos[datos.estilo];
  const e = escaparHtml;
  const filas = datos.contexto
    .map(
      ([nombre, valor]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e8edf0;color:#687789;font-size:13px;width:100px;vertical-align:top;">${e(nombre)}</td><td style="padding:10px 0;border-bottom:1px solid #e8edf0;color:#172b38;font-size:13px;font-weight:600;vertical-align:top;overflow-wrap:anywhere;">${e(valor)}</td></tr>`,
    )
    .join('');
  const detalle = datos.mensaje
    .split(/\r?\n/)
    .map(
      (linea) =>
        `<div style="margin:0 0 9px;overflow-wrap:anywhere;word-break:break-word;">${e(linea) || '&nbsp;'}</div>`,
    )
    .join('');
  const accion = datos.accion
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;"><tr><td bgcolor="#ed6b19" style="border-radius:10px;text-align:center;"><a href="https://app.powerpospioneers.com/" style="display:inline-block;padding:15px 24px;border:1px solid #ed6b19;border-radius:10px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">Revisar en PowerPOS &nbsp; &#8594;</a></td></tr></table><p style="margin:12px 0 0;color:#7a8793;font-size:12px;line-height:18px;">Ingresa con tu cuenta para consultar los detalles de tu empresa.</p>`
    : '';
  const pie =
    datos.pie ||
    'Este es un aviso automático. Para ajustar tus alertas, entra a Configuración → Usuarios en PowerPOS.';
  return {
    text: `PowerPOS\n${datos.titulo}\n\n${datos.introduccion}\n\n${datos.mensaje}\n\n${datos.contexto.map(([n, v]) => `${n}: ${v}`).join('\n')}${datos.accion ? '\n\nRevisar en PowerPOS: https://app.powerpospioneers.com/' : ''}\n\n${pie}`,
    html: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(datos.titulo)} · PowerPOS</title><style>@media only screen and (max-width:600px){.exterior{padding:16px 8px!important}.contenido{padding:26px 22px!important}.marca{padding:26px 22px!important}.titulo{font-size:27px!important;line-height:34px!important}.tarjeta{border-radius:16px!important}}</style></head>
<body style="margin:0;padding:0;background:#edf2f5;color:#172b38;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#edf2f5;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${e(datos.titulo)}. ${e(datos.introduccion)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#edf2f5"><tr><td class="exterior" align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="620" align="center"><tr><td><![endif]-->
<table role="presentation" class="tarjeta" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe7ec;border-radius:22px;overflow:hidden;">
<tr><td class="marca" bgcolor="#112e2b" style="padding:30px 36px;border-bottom:4px solid #ed6b19;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="66" style="vertical-align:middle;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#ffffff" style="width:54px;height:60px;text-align:center;border-radius:12px;"><img src="cid:${LOGO_CORREO_CID}" alt="PowerPOS" width="38" height="43" style="display:block;width:38px;height:43px;margin:8px;border:0;"></td></tr></table></td><td style="vertical-align:middle;"><div style="color:#ffffff;font-size:26px;line-height:30px;letter-spacing:-1px;font-weight:bold;">Power<span style="color:#ff9b58;">POS</span></div><div style="color:#bbd1c9;font-size:11px;line-height:19px;letter-spacing:2px;">TU NEGOCIO, CONECTADO</div></td></tr></table>
</td></tr>
<tr><td class="contenido" style="padding:34px 36px 32px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${estilo.fondo}" style="border:1px solid ${estilo.borde};padding:7px 10px;border-radius:6px;color:${estilo.color};font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.2px;">${estilo.etiqueta}</td></tr></table>
<h1 class="titulo" style="margin:20px 0 12px;color:#132f34;font-size:32px;line-height:39px;letter-spacing:-1px;font-weight:700;">${e(datos.titulo)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#647482;">${e(datos.introduccion)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${estilo.fondo}" style="border:1px solid ${estilo.borde};border-left:4px solid ${estilo.color};border-radius:10px;"><tr><td style="padding:19px 20px 12px;color:#263e47;font-size:14px;line-height:23px;">${detalle}</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;border-collapse:collapse;">${filas}</table>
${accion}
</td></tr>
<tr><td class="contenido" bgcolor="#f6f8f9" style="padding:22px 36px;border-top:1px solid #e8edf0;"><p style="margin:0;color:#6e7e89;font-size:12px;line-height:19px;">${e(pie)}</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 0;font-size:11px;line-height:18px;color:#7f8e98;"><strong style="color:#526973;">PowerPOS Pioneers</strong><br>Información clara para cuidar tu negocio.</p>
</td></tr></table></body></html>`,
  };
}

export function correoAlerta(datos: {
  tipo: string;
  mensaje: string;
  empresa: string;
  sucursal: string;
  fecha?: Date;
}): CorreoPowerpos {
  const tipo = datos.tipo.toLocaleUpperCase('es');
  const critico = /CR[IÍ]TICO|IRREGULAR|INESPERAD|DIFERENCIA|ANULACI[OÓ]N/.test(
    tipo,
  );
  const positivo = !critico && /CIERRE|APERTURA/.test(tipo);
  const titulo = tipo.startsWith('STOCK')
    ? 'Tu inventario necesita atención'
    : /APERTURA.*IRREGULAR/.test(tipo)
      ? 'Revisa esta apertura de caja'
      : /DIFERENCIA/.test(tipo)
        ? 'Hay una diferencia en caja'
        : /ANULACI[OÓ]N/.test(tipo)
          ? 'Se anuló una venta'
          : /CIERRE/.test(tipo)
            ? 'Cierre de caja registrado'
            : /APERTURA/.test(tipo)
              ? 'Apertura de caja registrada'
              : datos.tipo;
  return plantilla({
    estilo: critico ? 'critico' : positivo ? 'positivo' : 'atencion',
    titulo,
    introduccion: `Hay una actualización de ${datos.empresa} que queremos que tengas a la mano.`,
    mensaje: datos.mensaje,
    contexto: [
      ['Evento', datos.tipo],
      ['Empresa', datos.empresa],
      ['Sede', datos.sucursal],
      [
        'Fecha y hora',
        (datos.fecha || new Date()).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
        }),
      ],
    ],
    accion: true,
  });
}

export function correoPrueba(nombre: string): CorreoPowerpos {
  return plantilla({
    estilo: 'positivo',
    titulo: 'Tus alertas están conectadas',
    introduccion: `Hola, ${nombre}. Así recibirás las alertas de PowerPOS en tu correo.`,
    mensaje:
      'Este es un correo de prueba.\nTu dirección quedó registrada para recibir los avisos de inventario y caja que tengas activados.',
    contexto: [
      [
        '¿Qué sigue?',
        'Revisa tus preferencias y elige las alertas que quieres recibir.',
      ],
    ],
    accion: true,
  });
}

export function correoCumpleanos(
  nombre: string,
  empresa: string,
  administrador = false,
): CorreoPowerpos {
  return plantilla({
    estilo: 'celebracion',
    titulo: `¡Feliz cumpleaños, ${nombre}!`,
    introduccion: `Hoy celebramos contigo. Un saludo especial de parte de ${empresa}.`,
    mensaje:
      administrador
        ? 'Hoy queremos celebrar a la persona detrás de cada gran decisión. Gracias por confiar en PowerPOS y permitirnos acompañar tu negocio.\nTe deseamos un año lleno de alegría, salud y nuevos logros. ¡Tu confianza es muy importante para nosotros!'
        : 'Que este nuevo año de vida llegue con alegría, buenos momentos y muchas razones para sonreír.\nGracias por ser parte de nuestra comunidad. ¡Nos encantará volver a verte!',
    contexto: [['Con cariño', `El equipo de ${empresa}`]],
    pie: `Este saludo fue enviado por ${empresa} a través de PowerPOS.`,
  });
}
