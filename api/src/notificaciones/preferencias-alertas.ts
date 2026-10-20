import { BadRequestException } from '@nestjs/common';

export const ROLES_ALERTAS = ['ADMIN_EMPRESA', 'GERENTE'] as const;
export type PreferenciasAlertas = {
  email: string;
  stock: boolean;
  caja: boolean;
};
export const SIN_ALERTAS: PreferenciasAlertas = {
  email: '',
  stock: true,
  caja: true,
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
  return { email, stock: valor.stock, caja: valor.caja };
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
