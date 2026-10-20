'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Administrador = { id: number; nombre: string; rol: string; email: string; stock: boolean; caja: boolean };

export default function AlertasAdministradores() {
  const [administradores, setAdministradores] = useState<Administrador[]>([]);
  const [configurado, setConfigurado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [modificados, setModificados] = useState<number[]>([]);
  useEffect(() => {
    api.get('/notificaciones/configuracion').then(({ data }) => {
      setAdministradores(data.administradores); setConfigurado(data.correoConfigurado);
    }).catch(() => setMensaje('No se pudo cargar la configuración de alertas. Recarga para intentarlo de nuevo.')).finally(() => setCargando(false));
  }, []);
  const cambiar = (id: number, datos: Partial<Administrador>) => {
    setAdministradores(actual => actual.map(a => a.id === id ? { ...a, ...datos } : a));
    setModificados(actual => actual.includes(id) ? actual : [...actual, id]);
  };
  const guardar = async (a: Administrador) => {
    setOcupado(a.id); setMensaje('');
    try {
      await api.patch(`/notificaciones/administradores/${a.id}`, { email: a.email, stock: a.stock, caja: a.caja });
      setModificados(actual => actual.filter(id => id !== a.id));
      setMensaje(`Correo y alertas de ${a.nombre} guardados.${configurado ? '' : ' El envío se activará cuando se configure el correo de PowerPOS.'}`);
    } catch (error: any) { setMensaje(error.response?.data?.message || 'No se pudieron guardar las alertas'); }
    finally { setOcupado(null); }
  };
  const probar = async (id: number) => {
    setOcupado(id); setMensaje('');
    try { await api.post(`/notificaciones/administradores/${id}/prueba`); setMensaje('Prueba enviada. Revisa también la carpeta de correo no deseado.'); }
    catch (error: any) { setMensaje(error.response?.data?.message || 'No se pudo enviar la prueba'); }
    finally { setOcupado(null); }
  };
  return <section className="p-4 border-b border-gray-800 space-y-4">
    <div><h3 className="text-white font-semibold">Alertas por correo</h3>
      <p className="text-sm text-gray-400 mt-1">Correo personal de cada administrador o gerente. Es independiente del correo para iniciar sesión. Solo recibe información de esta empresa y sede.</p>
    </div>
    <p className={`text-sm rounded-lg p-3 ${configurado ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'}`}>
      {configurado ? 'Remitente configurado. Usa «Enviar prueba» para comprobar la entrega.' : 'Envío pendiente: falta configurar el correo remitente de PowerPOS. Puedes guardar los correos personales desde ahora.'}
    </p>
    {cargando && <p className="text-gray-400">Cargando administradores…</p>}
    {administradores.map(a => <form key={a.id} onSubmit={e => { e.preventDefault(); void guardar(a); }} className="rounded-xl bg-gray-800/60 p-4 space-y-3">
      <p className="text-white font-medium">{a.nombre} <span className="text-xs text-gray-400">· {a.rol === 'GERENTE' ? 'Gerente' : 'Administrador'}</span></p>
      <label className="block text-sm text-gray-300">Correo personal para alertas
        <input type="email" maxLength={254} value={a.email} onChange={e => cambiar(a.id, { email: e.target.value })} placeholder="nombre@gmail.com" className="block mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
      </label>
      <p className="text-xs text-gray-400">Deja el correo vacío para desactivar los envíos a esta persona.</p>
      <div className="flex flex-wrap gap-4 text-sm text-gray-300">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={a.stock} onChange={e => cambiar(a.id, { stock: e.target.checked })} />Stock bajo o crítico</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={a.caja} onChange={e => cambiar(a.id, { caja: e.target.checked })} />Aperturas, cierres y alertas de caja</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={ocupado !== null} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-white px-4 py-2 text-sm" type="submit">{ocupado === a.id ? 'Procesando…' : 'Guardar alertas'}</button>
        <button disabled={ocupado !== null || !configurado || !a.email || modificados.includes(a.id)} type="button" onClick={() => void probar(a.id)} className="bg-gray-700 disabled:opacity-40 rounded-lg text-white px-4 py-2 text-sm">Enviar prueba</button>
      </div>
    </form>)}
    <p className="text-xs text-gray-400">Inventario: revisión cada 5 minutos, con un aviso por nivel de alerta cada 24 horas mientras siga bajo. Caja: al registrar el evento. La apertura física del cajón solo puede notificarse si el equipo o el agente la reporta al sistema.</p>
    {mensaje && <p role="status" className="text-sm text-orange-300">{mensaje}</p>}
  </section>;
}
