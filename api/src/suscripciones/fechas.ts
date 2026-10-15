export function sumarMeses(fecha: Date, meses: number) {
  const resultado = new Date(fecha);
  const dia = resultado.getDate();
  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + meses);
  const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(dia, ultimoDia));
  return resultado;
}
