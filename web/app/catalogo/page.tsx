'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  Plus, Edit, Trash2, X, FileSpreadsheet, Upload, Download, FileText, ExternalLink, Image as ImageIcon, Search, Images, DollarSign,
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
  const [resultadoImportar, setResultadoImportar] = useState<{ creados: number; actualizados: number; totalFilas: number; errores: { fila: number; motivo: string }[] } | null>(null);
  const [errorImportar, setErrorImportar] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [slugTienda, setSlugTienda] = useState('');
  const [categoria, setCategoria] = useState('Todos');
  const [busqueda, setBusqueda] = useState('');

  const [modalImagenes, setModalImagenes] = useState(false);
  const [archivosImagenes, setArchivosImagenes] = useState<File[]>([]);
  const [subiendoImagenes, setSubiendoImagenes] = useState(false);
  const [resultadoImagenes, setResultadoImagenes] = useState<{ asignados: { archivo: string; producto: string }[]; creados: { archivo: string; producto: string }[]; sinCoincidencia: { archivo: string; motivo: string }[]; total: number } | null>(null);
  const [errorImagenes, setErrorImagenes] = useState('');

  const [modalSincronizar, setModalSincronizar] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSincronizar, setResultadoSincronizar] = useState<{ actualizados: { catalogo: string; producto: string }[]; sinCoincidencia: { catalogo: string; motivo: string }[]; total: number } | null>(null);
  const [errorSincronizar, setErrorSincronizar] = useState('');

  const [modalPrecios, setModalPrecios] = useState(false);
  const [sincronizandoPrecios, setSincronizandoPrecios] = useState(false);
  const [resultadoPrecios, setResultadoPrecios] = useState<{ actualizados: { catalogo: string; producto: string; precio: number }[]; sinCoincidencia: { catalogo: string; motivo: string }[]; total: number } | null>(null);
  const [errorPrecios, setErrorPrecios] = useState('');

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

  const [eliminandoTodos, setEliminandoTodos] = useState(false);
  const eliminarTodos = async () => {
    if (!confirm(`¿Eliminar los ${items.length} productos del catálogo? Esta acción no se puede deshacer. Las imágenes y precios de cada producto se pierden — tendrías que volver a subir el Excel y las fotos.`)) return;
    setEliminandoTodos(true);
    try {
      await api.delete('/catalogo/eliminar-todos');
      cargarDatos();
    } finally {
      setEliminandoTodos(false);
    }
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
      if (data.creados > 0 || data.actualizados > 0) cargarDatos();
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

  const abrirModalImagenes = () => {
    setArchivosImagenes([]);
    setResultadoImagenes(null);
    setErrorImagenes('');
    setModalImagenes(true);
  };

  const subirImagenes = async () => {
    if (!archivosImagenes.length) return;
    setSubiendoImagenes(true);
    setErrorImagenes('');
    setResultadoImagenes(null);
    try {
      const formData = new FormData();
      archivosImagenes.forEach((f) => formData.append('imagenes', f));
      const { data } = await api.post('/catalogo/importar-imagenes', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultadoImagenes(data);
      setArchivosImagenes([]);
      if (data.asignados.length > 0 || data.creados.length > 0) cargarDatos();
    } catch (e: any) {
      setErrorImagenes(e?.response?.data?.message || 'No se pudieron subir las imágenes');
    } finally {
      setSubiendoImagenes(false);
    }
  };

  const sincronizarImagenesAProductos = async () => {
    setModalSincronizar(true);
    setSincronizando(true);
    setErrorSincronizar('');
    setResultadoSincronizar(null);
    try {
      const { data } = await api.post('/catalogo/sincronizar-imagenes-productos');
      setResultadoSincronizar(data);
    } catch (e: any) {
      setErrorSincronizar(e?.response?.data?.message || 'No se pudo sincronizar las imágenes.');
    } finally {
      setSincronizando(false);
    }
  };

  const sincronizarPreciosDesdeProductos = async () => {
    setModalPrecios(true);
    setSincronizandoPrecios(true);
    setErrorPrecios('');
    setResultadoPrecios(null);
    try {
      const { data } = await api.post('/catalogo/sincronizar-precios-productos');
      setResultadoPrecios(data);
      if (data.actualizados?.length > 0) cargarDatos();
    } catch (e: any) {
      setErrorPrecios(e?.response?.data?.message || 'No se pudieron actualizar los precios.');
    } finally {
      setSincronizandoPrecios(false);
    }
  };

  const categorias = ['Todos', ...Array.from(new Set(items.map((i) => i.categoria).filter(Boolean) as string[]))];
  const visibles = items.filter(
    (i) =>
      (categoria === 'Todos' || i.categoria === categoria) &&
      i.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

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
                onClick={abrirModalImagenes}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg px-4 py-2 transition-colors"
              >
                <Images size={16} />
                Subir imágenes
              </button>
              <button
                onClick={sincronizarImagenesAProductos}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg px-4 py-2 transition-colors"
              >
                <Upload size={16} />
                Copiar imágenes a Productos
              </button>
              <button
                onClick={sincronizarPreciosDesdeProductos}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg px-4 py-2 transition-colors"
              >
                <DollarSign size={16} />
                Actualizar precios
              </button>
              {items.length > 0 && (
                <button
                  onClick={eliminarTodos}
                  disabled={eliminandoTodos}
                  className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  <Trash2 size={16} />
                  {eliminandoTodos ? 'Eliminando...' : 'Eliminar todo'}
                </button>
              )}
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
            <>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <div className="flex flex-wrap gap-1.5">
                  {categorias.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoria(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        categoria === c
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-gray-800 text-gray-400 border border-transparent hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 ml-auto">
                  <Search size={14} className="text-gray-500" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar producto..."
                    className="bg-transparent text-white text-sm focus:outline-none w-40"
                  />
                </div>
              </div>

              {visibles.length === 0 ? (
                <div className="text-center text-gray-500 py-20">
                  No hay productos que coincidan con ese filtro.
                </div>
              ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
              {visibles.map((item) => (
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
            </>
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
                Sube un archivo .xlsx con tus productos. Cada fila debe tener al menos el nombre. Si un producto (nombre + presentación) ya existe en el catálogo, se actualiza en vez de duplicarse.
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
                    ✅ {resultadoImportar.creados} producto(s) nuevo(s) creado(s), {resultadoImportar.actualizados} ya existente(s) actualizado(s) (sin duplicar), de {resultadoImportar.totalFilas} fila(s).
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

        {/* Modal subir imágenes en lote */}
        {modalImagenes && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Images size={20} className="text-orange-500" />
                  Subir imágenes en lote
                </h3>
                <button onClick={() => setModalImagenes(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Selecciona varias fotos a la vez. El nombre de cada archivo se compara con el nombre de los productos del catálogo para asignarla automáticamente — ej. &quot;banderillas-azucaradas-40-uni.png&quot; se asigna sola a &quot;BANDERILLAS AZUCARADAS 40 UNI&quot;. Si una foto no coincide con ningún producto existente (ej. &quot;sal himalaya 500g.jpg&quot;), se crea como producto nuevo del catálogo con ese nombre y esa presentación, sin precio — lo completas después con &quot;Editar&quot;.
              </p>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Imágenes</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => { setArchivosImagenes(Array.from(e.target.files || [])); setResultadoImagenes(null); setErrorImagenes(''); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-700 file:text-white file:text-sm"
                />
                {archivosImagenes.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1.5">{archivosImagenes.length} archivo(s) seleccionado(s)</p>
                )}
              </div>

              {errorImagenes && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
                  {errorImagenes}
                </div>
              )}

              {resultadoImagenes && (
                <div className="mb-4 space-y-2">
                  {resultadoImagenes.asignados.length > 0 && (
                    <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                      <p className="font-medium mb-1">✅ {resultadoImagenes.asignados.length} de {resultadoImagenes.total} imagen(es) asignada(s):</p>
                      <ul className="space-y-0.5">
                        {resultadoImagenes.asignados.map((a, i) => (
                          <li key={i}>{a.archivo} → {a.producto}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {resultadoImagenes.creados.length > 0 && (
                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                      <p className="font-medium mb-1">🆕 {resultadoImagenes.creados.length} producto(s) nuevo(s) creado(s) (sin precio, complétalo con &quot;Editar&quot;):</p>
                      <ul className="space-y-0.5">
                        {resultadoImagenes.creados.map((c, i) => (
                          <li key={i}>{c.archivo} → {c.producto}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {resultadoImagenes.sinCoincidencia.length > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                      <p className="font-medium mb-1">{resultadoImagenes.sinCoincidencia.length} sin asignar (asígnalas a mano con &quot;Editar&quot;):</p>
                      <ul className="space-y-0.5">
                        {resultadoImagenes.sinCoincidencia.map((s, i) => (
                          <li key={i}>{s.archivo}: {s.motivo}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button onClick={() => setModalImagenes(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cerrar
                </button>
                <button
                  onClick={subirImagenes}
                  disabled={!archivosImagenes.length || subiendoImagenes}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors"
                >
                  <Upload size={16} />
                  {subiendoImagenes ? 'Subiendo...' : 'Subir'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal copiar imágenes del catálogo a Productos */}
        {modalSincronizar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Upload size={20} className="text-orange-500" />
                  Copiar imágenes a Productos
                </h3>
                <button onClick={() => setModalSincronizar(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Busca cada producto del catálogo que ya tiene foto y se la copia al producto real del mismo nombre en tu inventario — así también se ve en tu tienda en línea. Solo completa productos que todavía no tienen imagen propia.
              </p>

              {sincronizando && <div className="py-8 text-center text-gray-500">Buscando coincidencias...</div>}

              {errorSincronizar && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
                  {errorSincronizar}
                </div>
              )}

              {resultadoSincronizar && !sincronizando && (
                <div className="mb-4 space-y-2">
                  {resultadoSincronizar.total === 0 ? (
                    <div className="bg-gray-800 text-gray-400 rounded-lg p-3 text-sm">
                      Ningún producto del catálogo tiene imagen todavía. Sube imágenes al catálogo primero.
                    </div>
                  ) : (
                    <>
                      {resultadoSincronizar.actualizados.length > 0 && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                          <p className="font-medium mb-1">✅ {resultadoSincronizar.actualizados.length} producto(s) actualizado(s):</p>
                          <ul className="space-y-0.5">
                            {resultadoSincronizar.actualizados.map((a, i) => (
                              <li key={i}>{a.catalogo} → {a.producto}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {resultadoSincronizar.sinCoincidencia.length > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                          <p className="font-medium mb-1">{resultadoSincronizar.sinCoincidencia.length} sin copiar:</p>
                          <ul className="space-y-0.5">
                            {resultadoSincronizar.sinCoincidencia.map((s, i) => (
                              <li key={i}>{s.catalogo}: {s.motivo}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {resultadoSincronizar.actualizados.length === 0 && resultadoSincronizar.sinCoincidencia.length === 0 && (
                        <div className="bg-gray-800 text-gray-400 rounded-lg p-3 text-sm">
                          Todos los productos que coinciden ya tienen imagen propia.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button onClick={() => setModalSincronizar(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cerrar
                </button>
                {resultadoSincronizar && !sincronizando && (
                  <button
                    onClick={sincronizarImagenesAProductos}
                    className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg py-3 transition-colors"
                  >
                    <Upload size={16} />
                    Volver a intentar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal actualizar precios del catálogo desde Productos */}
        {modalPrecios && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <DollarSign size={20} className="text-orange-500" />
                  Actualizar precios
                </h3>
                <button onClick={() => setModalPrecios(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Busca cada producto del catálogo y le pone el precio real que tiene en tu inventario, aunque ya tuviera uno puesto desde el Excel. Si no se encuentra un producto con nombre parecido, se deja igual.
              </p>

              {sincronizandoPrecios && <div className="py-8 text-center text-gray-500">Buscando coincidencias...</div>}

              {errorPrecios && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
                  {errorPrecios}
                </div>
              )}

              {resultadoPrecios && !sincronizandoPrecios && (
                <div className="mb-4 space-y-2">
                  {resultadoPrecios.total === 0 ? (
                    <div className="bg-gray-800 text-gray-400 rounded-lg p-3 text-sm">
                      El catálogo todavía no tiene productos.
                    </div>
                  ) : (
                    <>
                      {resultadoPrecios.actualizados.length > 0 && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                          <p className="font-medium mb-1">✅ {resultadoPrecios.actualizados.length} precio(s) actualizado(s):</p>
                          <ul className="space-y-0.5">
                            {resultadoPrecios.actualizados.map((a, i) => (
                              <li key={i}>{a.catalogo} → ${a.precio.toLocaleString('es-CO')}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {resultadoPrecios.sinCoincidencia.length > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                          <p className="font-medium mb-1">{resultadoPrecios.sinCoincidencia.length} sin actualizar:</p>
                          <ul className="space-y-0.5">
                            {resultadoPrecios.sinCoincidencia.map((s, i) => (
                              <li key={i}>{s.catalogo}: {s.motivo}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {resultadoPrecios.actualizados.length === 0 && resultadoPrecios.sinCoincidencia.length === 0 && (
                        <div className="bg-gray-800 text-gray-400 rounded-lg p-3 text-sm">
                          No hubo nada para actualizar.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button onClick={() => setModalPrecios(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cerrar
                </button>
                {resultadoPrecios && !sincronizandoPrecios && (
                  <button
                    onClick={sincronizarPreciosDesdeProductos}
                    className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg py-3 transition-colors"
                  >
                    <DollarSign size={16} />
                    Volver a intentar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
