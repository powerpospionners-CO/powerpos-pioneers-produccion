"use client";
import type { ProductoPublico } from "../../lib/tiendaPublica";
import { precioLinea, type OpcionesLinea } from "../../lib/opcionesTienda";

const dinero = (n: number) => `$${n.toLocaleString("es-CO")}`;

// Selector controlado de presentación, adicionales y nota; el precio se calcula con el catálogo.
export default function OpcionesProducto({
  producto,
  valor,
  onChange,
}: {
  producto: ProductoPublico;
  valor: OpcionesLinea;
  onChange: (v: OpcionesLinea) => void;
}) {
  const presentaciones = producto.presentaciones || [];
  const adicionales = producto.adicionales || [];
  const precio = precioLinea(producto, valor);
  const cantidadDe = (id: number) => valor.adicionales.find((a) => a.adicionalId === id)?.cantidad || 0;
  const fijar = (id: number, cantidad: number) =>
    onChange({
      ...valor,
      adicionales: [
        ...valor.adicionales.filter((a) => a.adicionalId !== id),
        ...(cantidad > 0 ? [{ adicionalId: id, cantidad: Math.min(10, cantidad) }] : []),
      ],
    });
  return (
    <div className="product-options">
      {presentaciones.length > 0 && (
        <fieldset>
          <legend>Presentación</legend>
          <label>
            <input
              type="radio"
              name={`presentacion-${producto.id}`}
              checked={!valor.presentacionId}
              onChange={() => onChange({ ...valor, presentacionId: undefined })}
            />
            <span>Normal</span>
            <b>{dinero(Number(producto.precio))}</b>
          </label>
          {presentaciones.map((p) => (
            <label key={p.id}>
              <input
                type="radio"
                name={`presentacion-${producto.id}`}
                checked={valor.presentacionId === p.id}
                onChange={() => onChange({ ...valor, presentacionId: p.id })}
              />
              <span>{p.nombre}</span>
              <b>{dinero(p.precio)}</b>
            </label>
          ))}
        </fieldset>
      )}
      {adicionales.length > 0 && (
        <fieldset>
          <legend>Adicionales</legend>
          {adicionales.map((a) => (
            <div key={a.id} className="product-option-extra">
              <span>
                {a.nombre} <small>+{dinero(a.precio)}</small>
              </span>
              <span className="product-option-qty">
                <button type="button" aria-label={`Quitar ${a.nombre}`} disabled={!cantidadDe(a.id)} onClick={() => fijar(a.id, cantidadDe(a.id) - 1)}>−</button>
                <output aria-live="polite">{cantidadDe(a.id)}</output>
                <button type="button" aria-label={`Agregar ${a.nombre}`} disabled={cantidadDe(a.id) >= 10} onClick={() => fijar(a.id, cantidadDe(a.id) + 1)}>+</button>
              </span>
            </div>
          ))}
        </fieldset>
      )}
      {adicionales.length > 0 && (
      <label className="product-option-note">
        Nota para la preparación (opcional)
        <input
          maxLength={140}
          placeholder="Ej.: sin cebolla"
          value={valor.observacion || ""}
          onChange={(e) => onChange({ ...valor, observacion: e.target.value })}
        />
      </label>
      )}
      {precio !== null && (
        <p className="product-option-price">
          Precio por unidad: <strong>{dinero(precio)}</strong>
        </p>
      )}
    </div>
  );
}
