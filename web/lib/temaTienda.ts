export function temaTienda(color: string, secundario?: string) {
  const valido = (v?: string) => !!v && /^#[0-9a-f]{6}$/i.test(v);
  const principal = valido(color) ? color : '#0f766e';
  const rgb = principal.slice(1).match(/../g)!.map(v => parseInt(v, 16));
  const luz = rgb.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  const luminancia = luz[0] * .2126 + luz[1] * .7152 + luz[2] * .0722;
  const texto = (luminancia + .05) / .05 >= 1.05 / (luminancia + .05) ? '#111111' : '#ffffff';
  const fondo = '#' + rgb.map(v => Math.round(v * .065 + 255 * .935).toString(16).padStart(2, '0')).join('');
  return { '--store-brand': principal, '--store-on-brand': texto, '--store-bg': fondo,
    '--store-secondary': valido(secundario) ? secundario! : principal };
}
