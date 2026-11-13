import type { TiendaPublica } from "./tiendaPublica";
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const dinero = (valor: string | number) =>
  Number(valor).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  });
export function responderTienda(
  pregunta: string,
  tienda: TiendaPublica,
  anteriores: number[] = [],
) {
  const q = normalizar(pregunta);
  const t = tienda.config;
  const respuesta = (
    texto: string,
    productoIds: number[] = [],
    derivar = false,
  ) => ({ texto, productoIds, derivar });
  const contacto = tienda.telefono || t.whatsapp;
  const asesor = contacto
    ? `Puedes consultar al negocio en ${contacto}.`
    : "El negocio todavía no ha configurado un teléfono de contacto.";
  if (
    /\b(horario|abren|abre|cierran|cierra|abierto|abierta|atienden)\b/.test(q)
  )
    return respuesta(
      t.horario
        ? `Horario de ${tienda.nombre}: ${t.horario}.`
        : `El negocio no ha publicado su horario. ${asesor}`,
      [],
      !t.horario,
    );
  if (
    /\b(direccion|ubicacion|ubicados|ubicada|quedan|queda|local|recoger)\b/.test(
      q,
    )
  )
    return respuesta(
      tienda.direccion
        ? `Nuestra dirección: ${tienda.direccion}. Confirma con el negocio antes de recoger un pedido.`
        : `No hay una dirección publicada. ${asesor}`,
      [],
      !tienda.direccion,
    );
  if (
    /\b(pago|pagos|pagar|nequi|daviplata|transferencia|tarjeta|efectivo)\b/.test(
      q,
    )
  )
    return respuesta(
      t.pagos
        ? `Información de pagos: ${t.pagos}. No solicito claves ni confirmo pagos por este chat.`
        : `El negocio no ha publicado sus medios de pago. ${asesor}`,
      [],
      !t.pagos,
    );
  if (
    /\b(envio|envios|domicilio|domicilios|entrega|entregan|demora|tarda|cobertura)\b/.test(
      q,
    )
  ) {
    const zonas = t.zonas
      .map((z) => `${z.nombre}: ${dinero(z.costo)}`)
      .join("; ");
    const publicado = [
      t.envios,
      zonas ? `Zonas y tarifas publicadas: ${zonas}.` : "",
      t.minimo ? `Pedido mínimo: ${dinero(t.minimo)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return respuesta(
      publicado
        ? `${publicado} El negocio confirma cobertura, disponibilidad y plazo de entrega.`
        : `No hay condiciones de entrega publicadas. ${asesor}`,
      [],
      !publicado,
    );
  }
  if (
    /\b(asesor|humano|persona|contacto|telefono|whatsapp|reclamo|devolucion|estado de mi pedido)\b/.test(
      q,
    )
  )
    return respuesta(asesor, [], true);
  if (/\b(origenes|paises|procedencia)\b/.test(q) || /que origen/.test(q)) {
    const origenes = [
      ...new Set(tienda.productos.map((p) => p.origen).filter(Boolean)),
    ];
    return respuesta(
      origenes.length
        ? `Orígenes del catálogo: ${origenes.join(", ")}. Puedes filtrarlos en Productos.`
        : "Este negocio todavía no ha asignado orígenes a sus productos.",
    );
  }
  if (/\b(categorias|catalogo)\b/.test(q))
    return respuesta(
      `Categorías del catálogo: ${[...new Set(tienda.productos.map((p) => p.categoria.nombre))].join(", ") || "Todavía no hay productos publicados"}.`,
    );
  if (
    /\b(comprar|pedido|pedir)\b/.test(q) &&
    !/\b(precio|cuesta|vale|tienen|hay)\b/.test(q)
  )
    return respuesta(
      t.pedidosHabilitados
        ? "Agrega productos al carrito, revisa cantidades y completa tus datos y zona. La solicitud queda pendiente de confirmación del negocio; no confirma un pago."
        : "Agrega productos al carrito y usa Pedir por WhatsApp para enviar tu consulta al negocio. Allí confirman disponibilidad, entrega y pago.",
    );
  const ignorar = new Set(
    "hola buenos buenas dias tardes noches quiero consultar ver buscar producto productos tienen tiene hay el la los las un una unos unas de del para por que cual cuanto cuesta cuestan vale precio precios es son esta estan me puedes decir saber y en venden comprar necesito disponible disponibilidad stock origen detalles descripcion su sus ese esa eso este esta me lo gracias favor".split(
      " ",
    ),
  );
  const tokens = [
    ...new Set(q.split(" ").filter((p) => p.length > 1 && !ignorar.has(p))),
  ];
  const ranking = tienda.productos
    .map((p) => {
      const nombre = normalizar(p.nombre);
      const contenido = `${nombre} ${normalizar(p.categoria.nombre)} ${normalizar(p.origen || "")} ${normalizar(p.descripcion || "")}`;
      const aciertos = tokens.filter(
        (token) =>
          contenido.includes(token) ||
          (token.length > 4 &&
            contenido.includes(token.replace(/(?:as|os|s)$/, ""))),
      ).length;
      return {
        p,
        score:
          tokens.length && aciertos === tokens.length
            ? aciertos + (q.includes(nombre) ? 10 : 0)
            : 0,
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  const contexto =
    !tokens.length &&
    /\b(precio|cuesta|vale|disponible|disponibilidad|stock|origen|detalles|descripcion)\b/.test(
      q,
    );
  const encontrados = ranking.length
    ? ranking.map((p) => p.p)
    : contexto
      ? tienda.productos.filter((p) => anteriores.includes(p.id))
      : [];
  if (encontrados.length) {
    const seleccion = encontrados.slice(0, 5);
    return respuesta(
      `${encontrados.length > 5 ? `Encontré ${encontrados.length} productos. Estos son los primeros cinco:\n` : ""}${seleccion.map((p) => `${p.nombre}: ${dinero(p.precio)}. ${p.disponible ? "Marcado disponible" : "Agotado"}.${p.origen ? ` Origen: ${p.origen}.` : ""}${p.descripcion ? ` ${p.descripcion}` : ""}`).join("\n")}\nLa disponibilidad final se confirma con el negocio.`,
      seleccion.map((p) => p.id),
    );
  }
  if (
    /^(hola|buenos dias|buenas tardes|buenas noches|buenas|gracias|muchas gracias)$/.test(
      q,
    )
  )
    return respuesta(
      `¡Hola! Soy el asistente automático de ${tienda.nombre}. Pregúntame por productos, precios, orígenes, horarios, dirección, pagos o entregas.`,
    );
  return respuesta(
    `No encontré una respuesta en la información publicada por ${tienda.nombre}. Puedes escribir el nombre del producto o preguntar por horarios, dirección y entregas. ${asesor}`,
    [],
    true,
  );
}
