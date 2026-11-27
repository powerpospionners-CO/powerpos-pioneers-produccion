/* Activa la verificación en dos pasos de un administrador de prueba con el flujo real (iniciar → activar con un código TOTP). */
const { codigoTotp } = require('../dist/src/auth/dos-pasos');

async function activarDosPasos(http, token) {
  const { secreto } = (await http.post('/auth/seguridad/2fa/iniciar').set('Authorization', token).expect(201)).body;
  await http
    .post('/auth/seguridad/2fa/activar')
    .set('Authorization', token)
    .send({ codigo: codigoTotp(secreto, Math.floor(Date.now() / 30000)) })
    .expect(201);
  return secreto;
}

module.exports = { activarDosPasos };
