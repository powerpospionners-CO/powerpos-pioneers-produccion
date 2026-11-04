'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

type Producto = { id: number; nombre: string; activo: boolean };
type Historial = {
  producto: { nombre: string; creadoEn: string; ventaGranel: boolean; unidadGranel: string | null };
  total: number;
  ventas: { numero: string; fecha: string; cantidad: number }[];
};

const fecha = (valor: string) => new Date(valor).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });

export default function HistorialVentasPage() {
  const [nombre, setNombre] = useState('');
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function consultar(id: number) {
    setOcupado(true);
    setError('');
    setHistorial(null);
    try {
      const { data } = await api.get<Historial>(`/productos/${id}/historial-ventas`);
      setHistorial(data);
    } catch {
      setError('No se pudo consultar el historial. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  async function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!nombre.trim()) return;
    setOcupado(true);
    setProductos(null);
    setHistorial(null);
    setError('');
    try {
      const { data } = await api.get<Producto[]>('/productos/historial-ventas', { params: { nombre: nombre.trim() } });
      setProductos(data);
      if (data.length === 1) await consultar(data[0].id);
    } catch {
      setError('No se pudo buscar el producto. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  const unidad = historial?.producto.ventaGranel ? historial.producto.unidadGranel || 'g' : 'unidades';
  return <AuthGuard>
    <main className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <section className="mx-auto max-w-4xl space-y-5 p-5">
        <Link href="/productos" className="text-sm text-orange-300">Volver a Productos</Link>
        <h1 className="text-2xl font-bold">Historial de ventas por producto</h1>
        <p className="text-sm text-gray-300">Consulta las ventas de caja desde la creación del producto. Las devoluciones se restan del total.</p>
        <form onSubmit={buscar} className="flex flex-wrap gap-2">
          <input aria-label="Nombre del producto" placeholder="Nombre del producto" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={150} className="min-w-48 flex-1 rounded-lg border border-gray-700 bg-gray-900 p-3" />
          <button disabled={ocupado || !nombre.trim()} className="rounded-lg bg-orange-600 px-5 font-semibold disabled:opacity-50">Buscar</button>
        </form>
        {ocupado && <p role="status">Consultando…</p>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {productos?.length === 0 && <p>No se encontraron productos con ese nombre.</p>}
        {!!productos?.length && <ul className="max-h-64 space-y-1 overflow-auto">
          {productos.map(p => <li key={p.id}>
            <button type="button" disabled={ocupado} onClick={() => void consultar(p.id)} className="w-full rounded-lg bg-gray-900 p-3 text-left hover:bg-gray-800 disabled:opacity-50">{p.nombre}{p.activo ? '' : ' · Inactivo'}</button>
          </li>)}
        </ul>}
        {historial && <section className="space-y-3 rounded-lg border border-gray-700 p-4">
          <h2 className="font-semibold">{historial.producto.nombre}</h2>
          <p className="text-sm text-gray-300">Desde el {fecha(historial.producto.creadoEn)}</p>
          <p className="text-xl font-bold">{historial.total.toLocaleString('es-CO')} {unidad}</p>
          {historial.ventas.length === 0 ? <p>No hay ventas vigentes de este producto.</p> :
            <table className="w-full text-left text-sm">
              <thead><tr><th>Fecha</th><th>Venta</th><th className="text-right">Cantidad</th></tr></thead>
              <tbody>{historial.ventas.map(venta => <tr key={venta.numero} className="border-t border-gray-800">
                <td className="py-2">{fecha(venta.fecha)}</td><td>{venta.numero}</td><td className="text-right">{venta.cantidad.toLocaleString('es-CO')}</td>
              </tr>)}</tbody>
            </table>}
        </section>}
      </section>
    </main>
  </AuthGuard>;
}
