import { ImpresionEventosService } from './impresion-eventos.service';

describe('ImpresionEventosService', () => {
  it('resuelve ok cuando el agente confirma a tiempo', async () => {
    const eventos = new ImpresionEventosService();
    const suscripcion = eventos.paraEmpresa(1).subscribe((trabajo) => {
      eventos.confirmar(trabajo.id, true);
    });

    const resultado = await eventos.enviarYEsperar(1, 'TICKET', Buffer.from('hola'), 2000);
    expect(resultado.ok).toBe(true);
    suscripcion.unsubscribe();
  });

  it('resuelve con error cuando nadie confirma (agente apagado)', async () => {
    const eventos = new ImpresionEventosService();
    const resultado = await eventos.enviarYEsperar(1, 'TICKET', Buffer.from('hola'), 200);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toMatch(/no respondió/i);
  });

  it('solo entrega el trabajo a la empresa correcta', async () => {
    const eventos = new ImpresionEventosService();
    const recibidosEmpresa2: any[] = [];
    const suscripcion = eventos.paraEmpresa(2).subscribe((t) => recibidosEmpresa2.push(t));

    eventos.enviarYEsperar(1, 'TICKET', Buffer.from('hola'), 200);
    await new Promise((r) => setTimeout(r, 50));

    expect(recibidosEmpresa2).toHaveLength(0);
    suscripcion.unsubscribe();
  });

  it('propaga el motivo de fallo reportado por el agente', async () => {
    const eventos = new ImpresionEventosService();
    const suscripcion = eventos.paraEmpresa(1).subscribe((trabajo) => {
      eventos.confirmar(trabajo.id, false, 'Impresora sin papel');
    });

    const resultado = await eventos.enviarYEsperar(1, 'COMANDA', Buffer.from('hola'), 2000);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBe('Impresora sin papel');
    suscripcion.unsubscribe();
  });
});
