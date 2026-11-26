"use client";

export default function ErrorTienda() {
  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, background: "#fffaf5", color: "#171717" }}>
      <section role="alert" style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>La tienda está tardando en responder</h1>
        <p style={{ margin: "20px 0" }}>No pudimos cargar el catálogo en este momento. Intenta de nuevo en unos segundos.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: "14px 24px", borderRadius: 12, background: "#171717", color: "white", cursor: "pointer", border: 0 }}>Volver a intentar</button>
        <p style={{ marginTop: 20, fontSize: 14 }}>Si acababas de enviar un pedido, revisa su confirmación antes de enviarlo otra vez.</p>
      </section>
    </main>
  );
}
