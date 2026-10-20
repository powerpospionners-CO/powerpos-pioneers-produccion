import { BadRequestException } from '@nestjs/common';

export const ROLES_ALERTAS = ['ADMIN_EMPRESA', 'GERENTE'] as const;
export type PreferenciasAlertas = {
  email: string;
  stock: boolean;
  caja: boolean;
  telefono: string;
  whatsapp: boolean;
};
export const SIN_ALERTAS: PreferenciasAlertas = {
  email: '',
  stock: true,
  caja: true,
  telefono: '',
  whatsapp: false,
};

export function validarPreferencias(datos: unknown): PreferenciasAlertas {
  const valor = datos as Partial<PreferenciasAlertas> | null;
  if (
    !valor ||
    typeof valor.email !== 'string' ||
    typeof valor.stock !== 'boolean' ||
    typeof valor.caja !== 'boolean'
  ) {
    throw new BadRequestException(
      'Indica el correo y las alertas que deseas recibir',
    );
  }
  const email = valor.email.trim().toLowerCase();
  if (
    email &&
    (email.length > 254 ||
      !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email))
  ) {
    throw new BadRequestException('El correo personal no es válido');
  }
  const telefono = normalizarTelefono(valor.telefono ?? '');
  if (valor.whatsapp !== undefined && typeof valor.whatsapp !== 'boolean')
    throw new BadRequestException('La autorización de WhatsApp no es válida');
  if (valor.whatsapp && !telefono)
    throw new BadRequestException('Indica el WhatsApp con indicativo del país');
  return {
    email,
    stock: valor.stock,
    caja: valor.caja,
    telefono,
    whatsapp: valor.whatsapp === true,
  };
}

export function normalizarTelefono(valor: unknown): string {
  if (typeof valor !== 'string')
    throw new BadRequestException('WhatsApp no válido');
  const telefono = valor
    .trim()
    .replace(/[ ()-]/g, '')
    .replace(/^\+/, '');
  if (telefono && !/^[1-9]\d{7,14}$/.test(telefono))
    throw new BadRequestException(
      'Usa el indicativo del país, por ejemplo +57 302 123 4567',
    );
  return telefono;
}

export function grupoAlerta(tipo: string): 'stock' | 'caja' | null {
  if (tipo.startsWith('STOCK')) return 'stock';
  if (
    tipo.includes('CAJA') ||
    tipo.includes('ANULACIÓN') ||
    tipo.includes('DEVOLUCIÓN')
  )
    return 'caja';
  return null;
}

export const escaparHtml = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
