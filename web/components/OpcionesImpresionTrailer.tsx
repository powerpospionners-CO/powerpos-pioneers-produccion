'use client';

export default function OpcionesImpresionTrailer({ comandas, recibo, onComandas, onRecibo, disabled = false }: {
  comandas: boolean; recibo: boolean; onComandas: (valor: boolean) => void; onRecibo: (valor: boolean) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="grid gap-2 rounded-xl border border-gray-700 bg-gray-950 p-3 text-white md:grid-cols-2">
    <legend className="px-1 text-sm font-semibold text-orange-300">Qué imprimir en esta venta</legend>
    <label className="flex min-h-12 cursor-pointer items-center gap-3"><input type="checkbox" checked={comandas} onChange={e => onComandas(e.target.checked)} className="h-6 w-6 accent-orange-500"/><span>Imprimir comandas<span className="block text-xs text-gray-400">Plancha / Perros y frituras · solo si hay productos</span></span></label>
    <label className="flex min-h-12 cursor-pointer items-center gap-3"><input type="checkbox" checked={recibo} onChange={e => onRecibo(e.target.checked)} className="h-6 w-6 accent-orange-500"/><span>Recibo del cliente<span className="block text-xs text-gray-400">Márcalo solo si el cliente lo pide</span></span></label>
  </fieldset>;
}
