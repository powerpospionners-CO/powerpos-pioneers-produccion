/** ESC * 33: tres bytes verticales por columna, en bandas de 24 puntos. */
export function codificarLogoEscPos(grises: Uint8Array, ancho: number, alto: number): Buffer {
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho < 1 || alto < 1 || ancho > 384 || alto > 200 || grises.length !== ancho * alto)
    throw new Error('Dimensiones de logo no válidas');
  const partes: Buffer[] = [Buffer.from([0x1b, 0x61, 1, 0x1b, 0x33, 24])];
  for (let y = 0; y < alto; y += 24) {
    const banda = Buffer.alloc(ancho * 3);
    for (let x = 0; x < ancho; x++) {
      for (let dy = 0; dy < 24 && y + dy < alto; dy++) {
        if (grises[(y + dy) * ancho + x] < 128)
          banda[x * 3 + Math.floor(dy / 8)] |= 0x80 >> (dy % 8);
      }
    }
    partes.push(Buffer.from([0x1b, 0x2a, 33, ancho & 0xff, (ancho >> 8) & 0xff]), banda, Buffer.from([0x0a]));
  }
  // Restaurar interlineado y alineación antes del texto del recibo.
  partes.push(Buffer.from([0x1b, 0x32, 0x1b, 0x61, 0]));
  return Buffer.concat(partes);
}
