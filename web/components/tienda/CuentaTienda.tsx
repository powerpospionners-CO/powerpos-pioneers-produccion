"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { solicitarTienda } from "../../lib/tiendaPublica";
import { encabezadoCuenta, guardarToken, leerToken } from "../../lib/cuentaTienda";
import CampoTrampa from "./CampoTrampa";

export type ItemCuenta = {
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  presentacionId?: number;
  adicionales?: { adicionalId: number; cantidad: number }[];
  observacion?: string;
};
type Item = ItemCuenta;
type Extras = {
  favoritos: number[];
  puntos: { vinculado: boolean; saldo: number; habilitado: boolean; valorPunto: number };
};
type Pedido = { id: string; estado: string; total: number; items: Item[]; creadoEn: string };
type Perfil = { cliente: { nombre: string; correo: string; telefono: string }; pedidos: Pedido[] };
type Modo = "ingresar" | "registro" | "olvido" | "restablecer";
const dinero = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n));
const estados: Record<string, string> = {
  RECIBIDO: "Por revisar",
  ACEPTADO: "Aceptado",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  RECHAZADO: "Cancelado",
};

export default function CuentaTienda({
  slug,
  nombreTienda,
  habilitadas,
  inicioHref,
  privacidadHref,
  onRepetir,
  productos = [],
  productoHref,
  resenasHabilitadas = false,
}: {
  slug: string;
  nombreTienda: string;
  habilitadas: boolean;
  inicioHref: string;
  privacidadHref?: string;
  onRepetir: (items: Item[]) => void;
  productos?: { id: number; nombre: string }[];
  productoHref?: (id: number) => string;
  resenasHabilitadas?: boolean;
}) {
  const base = `/tiendas/${encodeURIComponent(slug)}/cuenta`;
  const [modo, setModo] = useState<Modo>("ingresar"),
    [perfil, setPerfil] = useState<Perfil | null>(null),
    [form, setForm] = useState({ nombre: "", correo: "", telefono: "", contrasena: "", codigo: "", nueva: "" }),
    [acepta, setAcepta] = useState(false),
    [trampa, setTrampa] = useState(""),
    [edicion, setEdicion] = useState({ nombre: "", telefono: "" }),
    [claves, setClaves] = useState({ actual: "", nueva: "" }),
    [eliminar, setEliminar] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [listo, setListo] = useState(false),
    [extras, setExtras] = useState<Extras | null>(null),
    [codigoPuntos, setCodigoPuntos] = useState(""),
    [calificando, setCalificando] = useState<{ productoId: number; nombre: string } | null>(null),
    [resena, setResena] = useState({ estrellas: 5, texto: "" });
  const cargar = useCallback(async () => {
    if (!leerToken(slug)) {
      setPerfil(null);
      setListo(true);
      return;
    }
    try {
      const p = await solicitarTienda<Perfil>(base, { headers: encabezadoCuenta(slug) });
      setPerfil(p);
      setEdicion({ nombre: p.cliente.nombre, telefono: p.cliente.telefono });
      setExtras(await solicitarTienda<Extras>(`${base}/extras`, { headers: encabezadoCuenta(slug) }).catch(() => null));
    } catch {
      // Ficha vencida o revocada: se descarta en este navegador.
      guardarToken(slug, "");
      setPerfil(null);
    } finally {
      setListo(true);
    }
  }, [base, slug]);
  useEffect(() => {
    if (habilitadas) void cargar();
  }, [habilitadas, cargar]);
  if (!habilitadas)
    return (
      <section className="section store-form-page">
        <h1>Mi cuenta</h1>
        <p>{nombreTienda} no tiene cuentas de cliente activas. Puedes pedir sin registrarte.</p>
      </section>
    );
  async function ejecutar(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMensaje("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la solicitud");
    } finally {
      setBusy(false);
    }
  }
  const post = <T,>(ruta: string, body: unknown, auth = false) =>
    solicitarTienda<T>(`${base}${ruta}`, { method: "POST", body: JSON.stringify(body), headers: auth ? encabezadoCuenta(slug) : {} });
  const entrar = async (r: { token: string }) => {
    guardarToken(slug, r.token);
    setForm({ nombre: "", correo: "", telefono: "", contrasena: "", codigo: "", nueva: "" });
    await cargar();
  };
  function enviar(e: FormEvent) {
    e.preventDefault();
    void ejecutar(async () => {
      if (modo === "ingresar") await entrar(await post("/ingresar", { correo: form.correo, contrasena: form.contrasena }));
      if (modo === "registro")
        await entrar(await post("/registro", { nombre: form.nombre, correo: form.correo, telefono: form.telefono, contrasena: form.contrasena, consentimiento: acepta, sitio: trampa }));
      if (modo === "olvido") {
        await post("/codigo", { correo: form.correo });
        setModo("restablecer");
        setMensaje("Si el correo tiene una cuenta, te enviamos un código de 6 dígitos. Vence en 15 minutos.");
      }
      if (modo === "restablecer") await entrar(await post("/restablecer", { correo: form.correo, codigo: form.codigo, nueva: form.nueva }));
    });
  }
  if (!listo) return <section className="section store-form-page"><p role="status">Cargando tu cuenta…</p></section>;
  if (perfil)
    return (
      <section className="section store-form-page store-account">
        <div className="eyebrow">
          <span /> Mi cuenta
        </div>
        <h1>Hola, {perfil.cliente.nombre.split(" ")[0]}</h1>
        {mensaje && <p role="status" className="store-form-result">{mensaje}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <h2>Mis pedidos</h2>
        {!perfil.pedidos.length && <p>Aún no tienes pedidos con esta cuenta. Los pedidos que hagas con la sesión iniciada aparecerán aquí.</p>}
        <ul className="store-account-orders">
          {perfil.pedidos.map((p) => (
            <li key={p.id}>
              <div>
                <strong>Pedido #{p.id.slice(0, 8)}</strong>
                <span>{new Date(p.creadoEn).toLocaleDateString("es-CO")} · {estados[p.estado] || p.estado} · {dinero(p.total)}</span>
                <small>{p.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(", ")}</small>
              </div>
              <div className="store-form-actions">
                {resenasHabilitadas && p.estado === "ENTREGADO" &&
                  [...new Map(p.items.map((i) => [i.productoId, i])).values()].map((i) => (
                    <button key={i.productoId} type="button" className="button text" onClick={() => { setCalificando({ productoId: i.productoId, nombre: i.nombre }); setResena({ estrellas: 5, texto: "" }); }}>
                      Calificar {i.nombre}
                    </button>
                  ))}
                <a className="button text" href={`${inicioHref}?pedido=${encodeURIComponent(p.id)}`}>Ver seguimiento</a>
                <button type="button" className="button primary" onClick={() => { onRepetir(p.items); setMensaje("Agregamos al carrito los productos que siguen disponibles."); }}>
                  Repetir pedido
                </button>
              </div>
            </li>
          ))}
        </ul>
        {calificando && (
          <form
            className="store-form store-review-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutar(async () => {
                await post("/resenas", { productoId: calificando.productoId, ...resena }, true);
                setCalificando(null);
                setMensaje("Gracias por tu opinión. La tienda la revisará antes de publicarla.");
              });
            }}
          >
            <fieldset disabled={busy}>
              <legend>Califica {calificando.nombre}</legend>
              <div className="store-stars" role="radiogroup" aria-label="Calificación">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}>
                    <input type="radio" name="estrellas" checked={resena.estrellas === n} onChange={() => setResena({ ...resena, estrellas: n })} />
                    <span aria-hidden="true">{n <= resena.estrellas ? "★" : "☆"}</span>
                    <span className="sr-only">{n} de 5</span>
                  </label>
                ))}
              </div>
              <label>Comentario (opcional)<textarea maxLength={600} value={resena.texto} onChange={(e) => setResena({ ...resena, texto: e.target.value })} /></label>
              <p className="store-form-help">Se publica con tu primer nombre después de que la tienda la apruebe.</p>
              <div className="store-form-actions">
                <button className="button primary">Enviar opinión</button>
                <button type="button" className="button text" onClick={() => setCalificando(null)}>Cancelar</button>
              </div>
            </fieldset>
          </form>
        )}
        {extras?.puntos.habilitado && (
          <>
            <h2>Mis puntos</h2>
            {extras.puntos.vinculado ? (
              <p>
                Tienes <strong>{extras.puntos.saldo}</strong> puntos. Cada punto vale {dinero(extras.puntos.valorPunto)} y puedes usarlos al pagar tu pedido.
              </p>
            ) : (
              <form className="store-form" onSubmit={(e) => { e.preventDefault(); void ejecutar(async () => { setExtras(await post<Extras>("/vincular", { codigo: codigoPuntos }, true)); setCodigoPuntos(""); setMensaje("Tus puntos quedaron vinculados a esta cuenta."); }); }}>
                <fieldset disabled={busy}>
                  <p className="store-form-help">Pide en caja tu código para ver y usar aquí los puntos que acumulas en la tienda.</p>
                  <label>Código de 8 caracteres<input required maxLength={12} autoComplete="off" value={codigoPuntos} onChange={(e) => setCodigoPuntos(e.target.value.toUpperCase())} /></label>
                  <button className="button primary">Vincular mis puntos</button>
                </fieldset>
              </form>
            )}
          </>
        )}
        {!!extras?.favoritos.length && (
          <>
            <h2>Mis favoritos</h2>
            <ul className="store-account-favorites">
              {extras.favoritos.map((id) => {
                const prod = productos.find((x) => x.id === id);
                if (!prod) return null;
                return (
                  <li key={id}>
                    {productoHref ? <a href={productoHref(id)}>{prod.nombre}</a> : prod.nombre}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <h2>Mis datos</h2>
        <form className="store-form" onSubmit={(e) => { e.preventDefault(); void ejecutar(async () => { await solicitarTienda(base, { method: "PATCH", body: JSON.stringify(edicion), headers: encabezadoCuenta(slug) }); await cargar(); setMensaje("Datos actualizados."); }); }}>
          <fieldset disabled={busy}>
            <label>Nombre<input required maxLength={100} value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></label>
            <label>Teléfono<input required type="tel" maxLength={20} value={edicion.telefono} onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })} /></label>
            <p className="store-form-help">Correo: {perfil.cliente.correo}</p>
            <button className="button primary">Guardar datos</button>
          </fieldset>
        </form>
        <h2>Seguridad</h2>
        <form className="store-form" onSubmit={(e) => { e.preventDefault(); void ejecutar(async () => { const r = await post<{ token: string }>("/contrasena", claves, true); guardarToken(slug, r.token); setClaves({ actual: "", nueva: "" }); setMensaje("Contraseña actualizada. Cerramos las demás sesiones."); }); }}>
          <fieldset disabled={busy}>
            <label>Contraseña actual<input required type="password" autoComplete="current-password" value={claves.actual} onChange={(e) => setClaves({ ...claves, actual: e.target.value })} /></label>
            <label>Nueva contraseña<input required type="password" minLength={10} maxLength={72} autoComplete="new-password" value={claves.nueva} onChange={(e) => setClaves({ ...claves, nueva: e.target.value })} /></label>
            <p className="store-form-help">Mínimo 10 caracteres, con letras y números.</p>
            <button className="button primary">Cambiar contraseña</button>
          </fieldset>
        </form>
        <div className="store-form-actions">
          <button type="button" className="button text" disabled={busy} onClick={() => { guardarToken(slug, ""); setPerfil(null); }}>Cerrar sesión</button>
          <button type="button" className="button text" disabled={busy} onClick={() => void ejecutar(async () => { await post("/cerrar-sesiones", {}, true); guardarToken(slug, ""); setPerfil(null); })}>
            Cerrar sesión en todos los dispositivos
          </button>
        </div>
        <details className="store-account-delete">
          <summary>Eliminar mi cuenta</summary>
          <p>Se borran tus datos de cuenta y el historial asociado. Los pedidos ya enviados a la tienda se conservan para su contabilidad.</p>
          <form className="store-form" onSubmit={(e) => { e.preventDefault(); void ejecutar(async () => { await post("/eliminar", { contrasena: eliminar }, true); guardarToken(slug, ""); setPerfil(null); setMensaje("Tu cuenta fue eliminada."); }); }}>
            <fieldset disabled={busy}>
              <label>Confirma con tu contraseña<input required type="password" autoComplete="current-password" value={eliminar} onChange={(e) => setEliminar(e.target.value)} /></label>
              <button className="button text">Eliminar definitivamente</button>
            </fieldset>
          </form>
        </details>
      </section>
    );
  return (
    <section className="section store-form-page">
      <div className="eyebrow">
        <span /> Mi cuenta
      </div>
      <h1>{{ ingresar: "Ingresa a tu cuenta", registro: "Crea tu cuenta", olvido: "Restablecer contraseña", restablecer: "Escribe el código" }[modo]}</h1>
      {mensaje && <p role="status" className="store-form-result">{mensaje}</p>}
      <form className="store-form" onSubmit={enviar}>
        <fieldset disabled={busy}>
          {modo === "registro" && (
            <label>Nombre<input required maxLength={100} autoComplete="name" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
          )}
          <label>Correo<input required type="email" maxLength={200} autoComplete="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></label>
          {modo === "registro" && (
            <label>Teléfono<input required type="tel" maxLength={20} autoComplete="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
          )}
          {(modo === "ingresar" || modo === "registro") && (
            <label>
              Contraseña
              <input required type="password" minLength={modo === "registro" ? 10 : undefined} maxLength={72} autoComplete={modo === "registro" ? "new-password" : "current-password"} value={form.contrasena} onChange={(e) => setForm({ ...form, contrasena: e.target.value })} />
            </label>
          )}
          {modo === "restablecer" && (
            <>
              <label>Código de 6 dígitos<input required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></label>
              <label>Nueva contraseña<input required type="password" minLength={10} maxLength={72} autoComplete="new-password" value={form.nueva} onChange={(e) => setForm({ ...form, nueva: e.target.value })} /></label>
            </>
          )}
          {modo === "registro" && (
            <>
              <p className="store-form-help">Mínimo 10 caracteres, con letras y números.</p>
              <CampoTrampa valor={trampa} onChange={setTrampa} />
              <label className="store-check">
                <input type="checkbox" required checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                <span>
                  Autorizo a {nombreTienda} a guardar mis datos para gestionar mi cuenta y mis pedidos
                  {privacidadHref ? (
                    <>
                      {" "}según su <a href={privacidadHref} target="_blank" rel="noopener noreferrer">política de privacidad</a>
                    </>
                  ) : null}
                  .
                </span>
              </label>
            </>
          )}
          {error && <p role="alert" className="error">{error}</p>}
          <button className="button primary">
            {busy ? "Procesando…" : { ingresar: "Ingresar", registro: "Crear cuenta", olvido: "Enviar código", restablecer: "Cambiar contraseña" }[modo]}
          </button>
        </fieldset>
      </form>
      <div className="store-form-actions">
        {modo !== "ingresar" && <button type="button" className="store-link-button" onClick={() => { setModo("ingresar"); setError(""); }}>Ya tengo cuenta</button>}
        {modo !== "registro" && <button type="button" className="store-link-button" onClick={() => { setModo("registro"); setError(""); }}>Crear una cuenta</button>}
        {modo === "ingresar" && <button type="button" className="store-link-button" onClick={() => { setModo("olvido"); setError(""); }}>Olvidé mi contraseña</button>}
      </div>
    </section>
  );
}
