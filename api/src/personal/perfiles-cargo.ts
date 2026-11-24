import { BadRequestException } from '@nestjs/common';
export const claveCargo = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-CO')
    .replace(/\s+/g, ' ');
export const GUIAS_CARGOS = [
  {
    nombre: 'Cajera y auxiliar de atención al público',
    funciones:
      'Atender y orientar clientes; registrar ventas, recibir pagos y entregar comprobantes; realizar apertura, arqueo y cierre de caja; custodiar los valores recibidos y reportar diferencias; apoyar el orden, organización y limpieza del establecimiento con capacitación y elementos de protección adecuados.',
  },
  {
    nombre: 'Auxiliar de ventas externas',
    funciones:
      'Visitar empresas y clientes según las rutas acordadas; presentar productos, atender consultas y preparar cotizaciones con precios autorizados; gestionar y cerrar ventas dentro de sus facultades; registrar pedidos, visitas y resultados; coordinar disponibilidad y entregas con la tienda; dar seguimiento comercial y reportar novedades. Los descuentos, créditos y recaudos solo se realizarán cuando estén autorizados y documentados por el empleador.',
  },
  {
    nombre: 'Auxiliar de producción de totopos y tortillas',
    funciones:
      'Preparar ingredientes y elaborar totopos y tortillas conforme a recetas y procedimientos autorizados; apoyar cocción, formado, empaque y almacenamiento según la capacitación recibida; aplicar medidas de higiene y manipulación de alimentos; registrar lotes, cantidades y novedades de calidad; limpiar y desinfectar áreas y utensilios con procedimientos seguros; utilizar equipos y elementos de protección para los que haya sido capacitado; reportar riesgos, fallas y productos no conformes.',
  },
];
export function validarCargoPlantilla(plantilla: any, empleado: any, d: any) {
  const perfil = plantilla.perfilCargo ? claveCargo(plantilla.perfilCargo) : '';
  if (perfil && perfil !== claveCargo(String(empleado.cargo || '')))
    throw new BadRequestException(
      'La plantilla corresponde a otro cargo. Configura las condiciones del cargo del empleado; no se aplicarán funciones ni horarios de otro puesto',
    );
  if (!perfil && d.confirmarPerfilGeneral !== true)
    throw new BadRequestException(
      'La plantilla antigua no tiene cargo. Revisa expresamente sus funciones, jornada y lugar o crea un perfil específico para este empleado',
    );
}
