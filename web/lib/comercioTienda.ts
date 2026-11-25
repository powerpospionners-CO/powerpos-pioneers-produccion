export function fechaColombia(ahora: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const v = (k: string) => p.find((x) => x.type === k)?.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}
export function promocionVigente(
  p: { desde: string; hasta: string },
  fecha: string,
) {
  return p.desde <= fecha && p.hasta >= fecha;
}
export function redesTienda(t: {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
}) {
  return (["instagram", "facebook", "tiktok"] as const).flatMap((red) => {
    const valor = t[red]?.trim();
    if (!valor) return [];
    const dominio =
      red === "instagram"
        ? "instagram.com"
        : red === "facebook"
          ? "facebook.com"
          : "tiktok.com";
    try {
      const url = new URL(
        /^https:\/\//i.test(valor)
          ? valor
          : `https://${dominio}/${red === "tiktok" ? "@" : ""}${valor.replace(/^@/, "")}`,
      );
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !(url.hostname === dominio || url.hostname.endsWith("." + dominio))
      )
        return [];
      return [
        {
          nombre: {
            instagram: "Instagram",
            facebook: "Facebook",
            tiktok: "TikTok",
          }[red],
          url: url.toString(),
        },
      ];
    } catch {
      return [];
    }
  });
}
