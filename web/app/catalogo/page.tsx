'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  Plus, Edit, Trash2, X, FileSpreadsheet, Upload, Download, FileText, ExternalLink, Image as ImageIcon,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'powerpospioneers.com';

interface ItemCatalogo {
  id: number;
  nombre: string;
  presentacion: string | null;
  descripcion: string | null;
  precio: string | null;
  categoria: string | null;
  imagen: string | null;
  activo: boolean;
}

export default function CatalogoPage() {
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<ItemCatalogo | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nombre: '', categoria: '', presentacion: '', precio: '', descripcion: '' });
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [previewImagen, setPreviewImagen] = useState('');

  const [modalImportar, setModalImportar] = useState(false);
  const [archivoImportar, setArchivoImportar] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImportar, setResultadoImportar] = useState<{ creados: number; totalFilas: number; errores: { fila: number; motivo: string }[] } | null>(null);
  const [errorImportar, setErrorImportar] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [slugTienda, setSlugTienda] = useState('');

  useEffect(() => {
    cargarDatos();
    api.get('/empresa').then(({ data }) => setSlugTienda(data.tiendaSlug)).catch(() => {});
  }, []);

  const cargarDatos = async () => {
    const { data } = await api.get('/catalogo');
    setItems(data);
  };

  const abrirModal = (item?: ItemCatalogo) => {
    if (item) {
      setEditando(item);
      setForm({
        nombre: item.nombre,
        categoria: item.categoria || '',
        presentacion: item.presentacion || '',
        precio: item.precio ? String(item.precio) : '',
        descripcion: item.descripcion || '',
      });
      setPreviewImagen(item.imagen || '');
    } else {
      setEditando(null);
      setForm({ nombre: '', categoria: '', presentacion: '', precio: '', descripcion: '' });
      setPreviewImagen('');
    }
    setArchivoImagen(null);
    setModal(true);
  };

  const seleccionarImagen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivoImagen(file);
    setPreviewImagen(URL.createObjectURL(file));
  };

  const guardar = async () => {
    if (!form.nombre) return;
    setLoading(true);
    try {
      const payload = {
        nombre: form.nombre,
        categoria: form.categoria || null,
        presentacion: form.presentacion || null,
        precio: form.precio ? Number(form.precio) : null,
        descripcion: form.descripcion || null,
      };
      const { data: guardado } = editando
        ? await api.patch(`/catalogo/${editando.id}`, payload)
        : await api.post('/catalogo', payload);

      if (archivoImagen) {
        const formData = new FormData();
        formData.append('imagen', archivoImagen);
        await api.post(`/catalogo/${guardado.id}/imagen`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setModal(false);
      cargarDatos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const eliminar = async (item: ItemCatalogo) => {
    if (!confirm(`¿Eliminar "${item.nombre}" del catálogo?`)) return;
    await api.delete(`/catalogo/${item.id}`);
    cargarDatos();
  };

  const abrirModalImportar = () => {
    setArchivoImportar(null);
    setResultadoImportar(null);
    setErrorImportar('');
    setModalImportar(true);
  };

  const importarExcel = async () => {
    if (!archivoImportar) return;
    setImportando(true);
    setErrorImportar('');
    setResultadoImportar(null);
    try {
      const formData = new FormData();
      formData.append('archivo', archivoImportar);
      const { data } = await api.post('/catalogo/importar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultadoImportar(data);
      setArchivoImportar(null);
      if (data.creados > 0) cargarDatos();
    } catch (e: any) {
      setErrorImportar(e?.response?.data?.message || 'No se pudo importar el archivo');
    } finally {
      setImportando(false);
    }
  };

  const descargarPdf = async () => {
    setDescargandoPdf(true);
    try {
      const respuesta = await api.get('/catalogo/pdf', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([respuesta.data]));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'catalogo.pdf';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDescargandoPdf(false);
    }
  };

  const urlCatalogoWeb = slugTienda
    ? (typeof window !== 'undefined' && window.location.hostname.endsWith(ROOT_DOMAIN)
        ? `https://app.${ROOT_DOMAIN}/catalogo/${slugTienda}`
        : `${typeof window !== 'undefined' ? window.location.origin : ''}/catalogo/${slugTienda}`)
    : '';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
            <div>
              <h2 className="text-white text-xl font-bold">Catálogo de productos</h2>
              <p className="text-gray-500 text-sm mt-1">
                Un catálogo tipo folleto para compartir con distribuidores — {items.length} producto(s). No afecta tu inventario ni tus ventas.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {urlCatalogoWeb && (
                <a
                  href={urlCatalogoWeb}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  <ExternalLink size={16} />
                  Ver catálogo web
                </a>
              )}
              <button
                onClick={descargarPdf}
                disabled={descargandoPdf}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 transition-colors"
              >
                <FileText size={16} />
                {descargandoPdf ? 'Generando...' : 'Descargar PDF'}
              </button>
              <button
                onClick={abrirModalImportar}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg px-4 py-2 transition-colors"
              >
                <FileSpreadsheet size={16} />
                Importar Excel
              </button>
              <button
                onClick={() => abrirModal()}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-4 py-2 transition-colors"
              >
                <Plus size={18} />
                Nuevo producto
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-center text-gray-500 py-20">
              Aún no hay productos en el catálogo. Agrégalos uno por uno o impórtalos desde Excel.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
              {items.map((item) => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="h-32 bg-gray-800 flex items-center justify-center">
                    {item.imagen ? (
                      <img src={item.imagen} alt={item.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={28} className="text-gray-600" />
                    )}
                  </div>
                  <div className="p-3">
                    {item.categoria && <div className="text-orange-500 text-[11px] font-bold uppercase tracking-wide mb-0.5">{item.categoria}</div>}
                    <div className="text-white font-medium text-sm">{item.nombre}</div>
                    {item.presentacion && <div className="text-gray-500 text-xs mt-0.5">{item.presentacion}</div>}
                    {item.precio && <div className="text-gray-300 font-bold text-sm mt-1">${Number(item.precio).toLocaleString()}</div>}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => abrirModal(item)}
                        className="flex-1 flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2 py-1.5 rounded-lg transition-colors"
                      >
                        <Edit size={12} /> Editar
                      </button>
                      <button
                        onClick={() => eliminar(item)}
                        className="flex items-center justify-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-2 py-1.5 rounded-lg transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal producto */}
        {modal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-800 max-h-[90vh] overflow-y-auto">
              <h3 className="text-white font-bold text-lg mb-4">{editando ? 'Editar producto' : 'Nuevo producto'}</h3>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                    {previewImagen ? (
                      <img src={previewImagen} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={22} className="text-gray-600" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Imagen del producto</label>
                    <input type="file" id="imagen-catalogo" accept="image/*" onChange={seleccionarImagen} className="hidden" />
                    <button
                      type="button"
                      onClick={() => document.getElementById('imagen-catalogo')?.click()}
                      className="bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
                    >
                      {previewImagen ? 'Cambiar imagen' : 'Subir imagen'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Nombre del producto"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Categoría</label>
                    <input
                      type="text"
                      value={form.categoria}
                      onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="Ej: Lácteos"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Presentación (opcional)</label>
                    <input
                      type="text"
                      value={form.presentacion}
                      onChange={(e) => setForm({ ...form, presentacion: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="Ej: 500 G"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Precio (opcional)</label>
                    <input
                      type="number"
                      value={form.precio}
                      onChange={(e) => setForm({ ...form, precio: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Descripción (opcional)</label>
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Presentación, detalles, etc."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={loading || !form.nombre}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal importar desde Excel */}
        {modalImportar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-orange-500" />
                  Importar catálogo desde Excel
                </h3>
                <button onClick={() => setModalImportar(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Sube un archivo .xlsx con tus productos. Cada fila debe tener al menos el nombre.
              </p>

              <a
                href="/plantillas/plantilla-catalogo.xlsx"
                download
                className="flex items-center gap-2 text-orange-400 hover:text-orange-300 text-sm font-medium mb-5"
              >
                <Download size={15} />
                Descargar plantilla de ejemplo
              </a>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Archivo Excel (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => { setArchivoImportar(e.target.files?.[0] || null); setResultadoImportar(null); setErrorImportar(''); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-700 file:text-white file:text-sm"
                />
              </div>

              {errorImportar && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
                  {errorImportar}
                </div>
              )}

              {resultadoImportar && (
                <div className="mb-4 space-y-2">
                  <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg p-3 text-sm">
                    ✅ {resultadoImportar.creados} de {resultadoImportar.totalFilas} producto(s) importado(s) correctamente.
                  </div>
                  {resultadoImportar.errores.length > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                      <p className="font-medium mb-1">{resultadoImportar.errores.length} fila(s) con problemas:</p>
                      <ul className="space-y-0.5">
                        {resultadoImportar.errores.map((err, i) => (
                          <li key={i}>Fila {err.fila}: {err.motivo}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button onClick={() => setModalImportar(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cerrar
                </button>
                <button
                  onClick={importarExcel}
                  disabled={!archivoImportar || importando}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors"
                >
                  <Upload size={16} />
                  {importando ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
