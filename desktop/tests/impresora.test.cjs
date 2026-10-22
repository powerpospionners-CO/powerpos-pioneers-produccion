const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { enviar } = require("../impresora.cjs");
test("rechaza destinos públicos antes de abrir un socket", async () => {
  await assert.rejects(enviar("8.8.8.8", Buffer.from("prueba")), /no válido/);
});
test("envía los bytes una sola vez y marca fallos posteriores como inciertos", async () => {
  let envios = 0;
  class Socket extends EventEmitter {
    setTimeout() {}
    destroy() {}
    connect(_port, _host, callback) {
      setImmediate(callback);
    }
    end(_bytes, _callback) {
      envios++;
      setImmediate(() => this.emit("error", Error("cable desconectado")));
    }
  }
  await assert.rejects(
    enviar("192.168.1.90", Buffer.from("prueba"), 3000, () => new Socket()),
    (e) => e.antesDeEnviar === false,
  );
  assert.equal(envios, 1);
});
