'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Plus, Search, Star, Phone, Mail, QrCode, Download, X } from 'lucide-react';
import QRCode from 'qrcode';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'powerpospioneers.com';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState<any>(null);
  const [modalDetalle, setModalDetalle] = useState<any>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [modalPuntos, setModalPuntos] = useState<any>(null);
  const [puntosForm, setPuntosForm] = useState({ tipo: 'agregar', cantidad: '' });
  const [loading, setLoading] = useState(false);
  const [modalQR, setModalQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [urlRegistro, setUrlRegistro] = useState('');
  const [nombreEmpresaQR, setNombreEmpresaQR] = useState('');
  const [formNuevo, setFormNuevo] = useState({
    nombre: '', documento: '', telefono: '', email: '', direccion: '', fechaNacimiento: '',
  });
  const [formEditar, setFormEditar] = useState({
    nombre: '', documento: '', telefono: '', email: '', direccion: '', fechaNacimiento: '',
  });

  useEffect(() => {
    cargarClientes();
    const intervalo = setInterval(cargarClientes, 10000);
    return () => clearInterval(intervalo);
  }, [busqueda]);

  const cargarClientes = async () => {
    const { data } = await api.get(`/clientes${busqueda ? `?busqueda=${busqueda}` : ''}`);
    setClientes(data);
  };

  const crearCliente = async () => {
    if (!formNuevo.nombre) return;
    setLoading(true);
    try {
      await api.post('/clientes', formNuevo);
      setModalNuevo(false);
      setFormNuevo({ nombre: '', documento: '', telefono: '', email: '', direccion: '', fechaNacimiento: '' });
      cargarClientes();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const abrirEdicion = (cliente: any) => {
    setModalEditar(cliente);
    setFormEditar({
      nombre: cliente.nombre || '',
      documento: cliente.documento || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
      fechaNacimiento: cliente.fechaNacimiento ? cliente.fechaNacimiento.split('T')[0] : '',
    });
  };

  const guardarEdicion = async () => {
    if (!modalEditar) return;
    setLoading(true);
    try {
      await api.patch(`/clientes/${modalEditar.id}`, formEditar);
      setModalEditar(null);
      cargarClientes();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const abrirQR = async () => {
    setModalQR(true);
    try {
      const { data: empresa } = await api.get('/empresa');
      const enDominioReal = window.location.hostname.endsWith(ROOT_DOMAIN);
      const url = enDominioReal
        ? `https://app.${ROOT_DOMAIN}/registro/${empresa.tiendaSlug}`
        : `${window.location.origin}/registro/${empresa.tiendaSlug}`;
      setUrlRegistro(url);
      setNombreEmpresaQR(empresa.nombre);
      const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#101f26', light: '#ffffff' } });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error(e);
    }
  };

  const descargarQR = () => {
    const enlace = document.createElement('a');
    enlace.href = qrDataUrl;
    enlace.download = `qr-registro-${nombreEmpresaQR.toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  };

  const toggleActivo = async (cliente: any) => {
    try {
      await api.patch(`/clientes/${cliente.id}/toggle-activo`);
      cargarClientes();
    } catch (e) {
      console.error(e);
    }
  };

  const verDetalle = async (cliente: any) => {
    setModalDetalle(cliente);
    const { data } = await api.get(`/clientes/${cliente.id}`);
    setDetalle(data);
  };

  const gestionarPuntos = async () => {
    if (!modalPuntos || !puntosForm.cantidad) return;
    setLoading(true);
    try {
      const ruta = puntosForm.tipo === 'agregar' ? 'agregar' : 'redimir';
      await api.post(`/clientes/${modalPuntos.id}/puntos/${ruta}`, { puntos: Number(puntosForm.cantidad) });
      setModalPuntos(null);
      setPuntosForm({ tipo: 'agregar', cantidad: '' });
      cargarClientes();
      if (modalDetalle) verDetalle(modalDetalle);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        <div className="flex-1 p-6 space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, teléfono o documento..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={abrirQR}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
                >
                  <QrCode size={16} />
                  Código QR de registro
                </button>
                <button
                  onClick={() => setModalNuevo(true)}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
                >
                  <Plus size={16} />
                  Nuevo cliente
                </button>
              </div>
            </div>

            {clientes.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay clientes registrados</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {clientes.map((cliente) => (
                  <div key={cliente.id} className={`p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors ${!cliente.activo ? 'opacity-50' : ''}`}>
                    <button onClick={() => verDetalle(cliente)} className="flex-1 text-left">
                      <div className="text-white font-medium text-sm flex items-center gap-2">
                        {cliente.nombre}
                        {!cliente.activo && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Inactivo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-gray-500 text-xs mt-1">
                        {cliente.documento && <span>📄 {cliente.documento}</span>}
                        {cliente.telefono && <span className="flex items-center gap-1"><Phone size={12} />{cliente.telefono}</span>}
                        {cliente.email && <span className="flex items-center gap-1"><Mail size={12} />{cliente.email}</span>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1">
                        <Star size={14} className="text-yellow-400" />
                        <span className="text-yellow-400 text-sm font-bold">{cliente.puntos}</span>
                      </div>
                      <button
                        onClick={() => setModalPuntos(cliente)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Puntos
                      </button>
                      <button
                        onClick={() => abrirEdicion(cliente)}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActivo(cliente)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                          cliente.activo ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                        }`}
                      >
                        {cliente.activo ? 'Inactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal código QR de registro */}
        {modalQR && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-800 text-center">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <QrCode size={20} className="text-orange-500" />
                  Código QR de registro
                </h3>
                <button onClick={() => setModalQR(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-4 text-left">
                Imprime este código y ponlo en tu local. El cliente lo escanea, llena sus datos y queda registrado directo en tu base de clientes.
              </p>
              {qrDataUrl ? (
                <>
                  <div className="bg-white rounded-xl p-4 inline-block">
                    <img src={qrDataUrl} alt="Código QR de registro" className="w-56 h-56" />
                  </div>
                  <p className="text-gray-500 text-xs break-all mt-3">{urlRegistro}</p>
                  <button
                    onClick={descargarQR}
                    className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-4 py-3 mt-4 transition-colors"
                  >
                    <Download size={16} />
                    Descargar imagen
                  </button>
                </>
              ) : (
                <div className="py-10 text-gray-500 text-sm">Generando código...</div>
              )}
            </div>
          </div>
        )}

        {/* Modal nuevo cliente */}
        {modalNuevo && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">Nuevo cliente</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={formNuevo.nombre}
                    onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Nombre completo" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Documento</label>
                    <input type="text" value={formNuevo.documento}
                      onChange={(e) => setFormNuevo({ ...formNuevo, documento: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="Cédula / NIT" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Teléfono</label>
                    <input type="text" value={formNuevo.telefono}
                      onChange={(e) => setFormNuevo({ ...formNuevo, telefono: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="+57 300 123 4567" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email (opcional)</label>
                  <input type="email" value={formNuevo.email}
                    onChange={(e) => setFormNuevo({ ...formNuevo, email: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="correo@email.com" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Dirección (opcional)</label>
                  <input type="text" value={formNuevo.direccion}
                    onChange={(e) => setFormNuevo({ ...formNuevo, direccion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Dirección de residencia" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Fecha de nacimiento (opcional)</label>
                  <input type="date" value={formNuevo.fechaNacimiento}
                    onChange={(e) => setFormNuevo({ ...formNuevo, fechaNacimiento: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalNuevo(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={crearCliente} disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Creando...' : 'Crear cliente'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal editar cliente */}
        {modalEditar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">Editar cliente</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={formEditar.nombre}
                    onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Documento</label>
                    <input type="text" value={formEditar.documento}
                      onChange={(e) => setFormEditar({ ...formEditar, documento: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Teléfono</label>
                    <input type="text" value={formEditar.telefono}
                      onChange={(e) => setFormEditar({ ...formEditar, telefono: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <input type="email" value={formEditar.email}
                    onChange={(e) => setFormEditar({ ...formEditar, email: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Dirección</label>
                  <input type="text" value={formEditar.direccion}
                    onChange={(e) => setFormEditar({ ...formEditar, direccion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Fecha de nacimiento</label>
                  <input type="date" value={formEditar.fechaNacimiento}
                    onChange={(e) => setFormEditar({ ...formEditar, fechaNacimiento: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalEditar(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={guardarEdicion} disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal puntos */}
        {modalPuntos && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-1">{modalPuntos.nombre}</h3>
              <p className="mb-3 text-sm text-gray-400">Canjea desde una venta en POS. Los ajustes manuales solo los realiza el administrador.</p>
              <p className="text-gray-400 text-sm mb-4">
                Puntos actuales: <span className="text-yellow-400 font-bold">{modalPuntos.puntos}</span>
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Acción</label>
                  <select value={puntosForm.tipo} onChange={(e) => setPuntosForm({ ...puntosForm, tipo: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                    <option value="agregar">Agregar puntos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cantidad</label>
                  <input type="number" value={puntosForm.cantidad}
                    onChange={(e) => setPuntosForm({ ...puntosForm, cantidad: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="0" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalPuntos(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={gestionarPuntos} disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal detalle cliente */}
        {modalDetalle && detalle && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-800 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg">{detalle.nombre}</h3>
                  <div className="flex items-center gap-3 text-gray-500 text-xs mt-1">
                    {detalle.documento && <span>📄 {detalle.documento}</span>}
                    {detalle.telefono && <span>{detalle.telefono}</span>}
                    {detalle.email && <span>{detalle.email}</span>}
                  </div>
                  {(detalle.direccion || detalle.fechaNacimiento) && (
                    <div className="flex items-center gap-3 text-gray-500 text-xs mt-1">
                      {detalle.direccion && <span>📍 {detalle.direccion}</span>}
                      {detalle.fechaNacimiento && (
                        <span>🎂 {new Date(detalle.fechaNacimiento).toLocaleDateString('es-CO')}</span>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => { setModalDetalle(null); setDetalle(null); }} className="text-gray-500 hover:text-white transition-colors text-xl">✕</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-white font-bold text-lg">{detalle.totalPedidos}</div>
                  <div className="text-gray-500 text-xs">Pedidos</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-orange-500 font-bold text-lg">${detalle.totalGastado.toLocaleString()}</div>
                  <div className="text-gray-500 text-xs">Total gastado</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-yellow-400 font-bold text-lg">{detalle.puntos}</div>
                  <div className="text-gray-500 text-xs">Puntos</div>
                </div>
              </div>

              <h4 className="text-gray-400 text-xs font-medium uppercase mb-2">Historial de pedidos</h4>
              <div className="flex-1 overflow-y-auto space-y-2">
                {detalle.pedidos.length === 0 ? (
                  <p className="text-gray-500 text-center py-8 text-sm">Sin pedidos registrados</p>
                ) : (
                  detalle.pedidos.map((pedido: any) => (
                    <div key={pedido.id} className="bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-sm font-medium">{pedido.numero}</span>
                        <span className="text-orange-500 text-sm font-bold">${Number(pedido.total).toLocaleString()}</span>
                      </div>
                      <div className="text-gray-500 text-xs">
                        {pedido.detalles.map((d: any) => `${d.cantidad}x ${d.producto.nombre}`).join(', ')}
                      </div>
                      <div className="text-gray-600 text-xs mt-1">
                        {new Date(pedido.creadoEn).toLocaleString('es-CO')} · {pedido.estado}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
