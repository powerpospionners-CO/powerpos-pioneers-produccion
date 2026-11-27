/* Activa la verificación en dos pasos de un administrador de prueba con el flujo real (iniciar → activar con un código TOTP). */
const { randomBytes } = require('node:crypto');
const { codigoTotp } = require('../dist/src/auth/dos-pasos');

async function activarDosPasos(http, token) {
  // El secreto de 2FA se cifra; si la prueba no definió clave, se usa una temporal solo durante la activación
  // para no cambiar el comportamiento de Bold o de la tienda en el resto de la prueba.
  const temporal = !process.env.PERSONAL_ENCRYPTION_KEY && !process.env.BOLD_ENCRYPTION_KEY;
  if (temporal) process.env.PERSONAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  try {
    const { secreto } = (await http.post('/auth/seguridad/2fa/iniciar').set('Authorization', token).expect(201)).body;
    await http
      .post('/auth/seguridad/2fa/activar')
      .set('Authorization', token)
      .send({ codigo: codigoTotp(secreto, Math.floor(Date.now() / 30000)) })
      .expect(201);
    return secreto;
  } finally {
    if (temporal) delete process.env.PERSONAL_ENCRYPTION_KEY;
  }
}

module.exports = { activarDosPasos };
