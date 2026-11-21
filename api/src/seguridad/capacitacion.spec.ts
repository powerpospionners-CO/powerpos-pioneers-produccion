import { validarCapacitacion, marcarImpresionCapacitacion } from './capacitacion';
describe('Entorno de capacitación', () => {
  const valido = { CAPACITACION:'true', DATABASE_URL:'mysql://u748056473_ppcapacitacion:solo-prueba@127.0.0.1/u748056473_ppcapacitacion', DATABASE_ENGINE:'mysql', BACKGROUND_JOBS_ENABLED:'false', IMPRESION_MODO:'agente', JWT_SECRET:'x'.repeat(48) };
  it('rechaza las bases productivas y credenciales de servicios externos', () => {
    expect(()=>validarCapacitacion(valido)).not.toThrow();
    for(const nombre of ['ppcontrol','pptrailer','ppenchila','ppcajica']) expect(()=>validarCapacitacion({...valido,DATABASE_URL:`mysql://usuario:clave@localhost/u748056473_${nombre}`})).toThrow();
    expect(()=>validarCapacitacion({...valido,SMTP_USER:'no-usar'})).toThrow();
    expect(()=>validarCapacitacion({...valido,BACKGROUND_JOBS_ENABLED:'true'})).toThrow();
    expect(()=>validarCapacitacion({})).not.toThrow();
  });
  it('marca tickets, comandas y cierres sin alterar el contenido imprimible', () => {
    const anterior=process.env.CAPACITACION;
    try {
      process.env.CAPACITACION='true';
      const datos=Buffer.from('PEDIDO DE PRUEBA\n');
      const marcado=marcarImpresionCapacitacion(datos);
      expect(marcado.toString()).toContain('PRUEBA / CAPACITACION');
      expect(marcado.toString()).toContain('SIN VALIDEZ COMERCIAL');
      expect(marcado.subarray(-datos.length)).toEqual(datos);
      process.env.CAPACITACION='false';expect(marcarImpresionCapacitacion(datos)).toBe(datos);
    } finally { if(anterior===undefined)delete process.env.CAPACITACION;else process.env.CAPACITACION=anterior; }
  });
});
