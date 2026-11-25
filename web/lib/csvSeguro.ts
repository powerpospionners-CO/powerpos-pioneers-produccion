// Celda CSV entre comillas; neutraliza fórmulas para que Excel no ejecute datos escritos por clientes.
export function csvSeguro(valor: unknown) {
  let texto = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
  return `"${texto.replace(/"/g, '""')}"`;
}
