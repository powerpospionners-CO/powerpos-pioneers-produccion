export const CONTROL_DISTRIBUIDOR = 'CONTROL_PEDIDO_DISTRIBUIDOR';
export async function controlesDistribuidor(db: any, empresaId: number, ids: number[]) {
  const controles = new Map<number, any>();
  if (!ids.length) return controles;
  const registros = await db.auditoria.findMany({ where: { empresaId, entidad: CONTROL_DISTRIBUIDOR, entidadId: { in: ids } }, orderBy: { id: 'desc' } });
  for (const r of registros) if (!controles.has(r.entidadId)) controles.set(r.entidadId, r.detalle);
  return controles;
}
export async function gestionPedidos(db: any, empresaId: number, pedidos: any[]) {
  const controles = await controlesDistribuidor(db, empresaId, pedidos.map(p=>p.id));
  const ids = [...controles.values()].map(c=>c.pedidoCajaId).filter(Boolean);
  const ventas: any[] = ids.length ? await db.pedido.findMany({ where: { id: { in: ids }, sucursal: { empresaId } }, include: { cuentaCredito: true, operacionesCaja: { where: { tipo: 'DEVOLUCION' }, select: { id: true } } } }) : [];
  const porId = new Map(ventas.map(v=>[v.id,v]));
  return pedidos.map(p=>{
    const control = controles.get(p.id);
    if (!control) return { ...p, modalidad: 'HISTORICO', estadoGestion: p.estado === 'ANULADO' ? 'ANULADO' : 'HISTORICO', saldoPendiente: null, entregado: true, comisionDisponible: false };
    const venta = porId.get(control.pedidoCajaId);
    const revision = !!control.pedidoCajaId && (!venta || venta.estado === 'ANULADO' || venta.devueltoTotal || venta.operacionesCaja.length > 0);
    const saldo = venta ? Number(venta.cuentaCredito?.saldo ?? 0) : Number(p.total);
    const estado = p.estado === 'ANULADO' ? 'ANULADO' : revision ? 'EN_REVISION' : !control.pedidoCajaId ? 'PENDIENTE_RETIRO' : saldo > 0 ? 'PENDIENTE_PAGO' : 'PAGADO';
    return { ...p, modalidad: control.modalidad, estadoGestion: estado, saldoPendiente: saldo, entregado: !!control.pedidoCajaId, pedidoCajaId: control.pedidoCajaId || null, numeroCaja: venta?.numero || null, comisionDisponible: estado === 'PAGADO' };
  });
}
