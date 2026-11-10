const { test } = require("node:test"), assert = require("node:assert/strict");
const { normalizarMac, tablaArp, localizar, crearRevisionDiaria, diaBogota } = require("../red-impresora.cjs");
const mac = "02:11:22:33:44:55";
test("interpreta ARP sin depender del idioma de Windows y descarta identidades ambiguas", () => {
  const tabla = tablaArp("  192.168.1.20    02-11-22-33-44-55    dinámico\r\n  192.168.1.21    ff-ff-ff-ff-ff-ff static\n  192.168.1.20  02-aa-bb-cc-dd-ee dynamic\n");
  assert.equal(tabla.get("192.168.1.20"), undefined);
  assert.equal(tabla.has("192.168.1.21"), false);
  assert.equal(normalizarMac("02-11-22-33-44-55"), mac);
  assert.equal(normalizarMac("00:00:00:00:00:00"), undefined);
});
test("reconoce la impresora guardada sin recorrer toda la red", async () => {
  const r = await localizar({ impresora: "192.168.1.20", impresoraMac: mac }, {
    sondear: async () => true, vecinos: async () => new Map([["192.168.1.20", mac]]),
    explorar: () => assert.fail("No necesita escanear"),
  });
  assert.deepEqual(r, { ip: "192.168.1.20", mac });
});
test("sigue la misma MAC después de cambiar la IP aunque haya otras impresoras", async () => {
  const r = await localizar({ impresora: "192.168.1.20", impresoraMac: mac }, {
    sondear: async () => false, explorar: async () => ["192.168.1.30", "192.168.1.40"],
    vecinos: async () => new Map([["192.168.1.30", "02:aa:bb:cc:dd:ee"], ["192.168.1.40", mac]]),
  });
  assert.equal(r.ip, "192.168.1.40");
});
test("no imprime en otro equipo que heredó la IP anterior", async () => {
  const r = await localizar({ impresora: "192.168.1.20", impresoraMac: mac }, {
    sondear: async () => true, explorar: async () => ["192.168.1.20", "192.168.1.40"],
    vecinos: async () => new Map([["192.168.1.20", "02:aa:bb:cc:dd:ee"], ["192.168.1.40", mac]]),
  });
  assert.equal(r.ip, "192.168.1.40");
});
test("no sustituye una impresora apagada por la única candidata de otra identidad", async () => {
  await assert.rejects(localizar({ impresora: "192.168.1.20", impresoraMac: mac }, {
    sondear: async () => false, explorar: async () => ["192.168.1.30"],
    vecinos: async () => new Map([["192.168.1.30", "02:aa:bb:cc:dd:ee"]]),
  }), /No se encontró/);
});
test("sin identidad previa exige confirmar la selección si la IP ya no responde", async () => {
  await assert.rejects(localizar({ impresora: "192.168.1.20" }, {
    sondear: async () => false, explorar: () => assert.fail("No debe elegir otra impresora"),
  }), /MAC/);
});
test("verifica al iniciar y al cambiar el día de Bogotá sin repetir al mismo tiempo", async () => {
  let fecha = new Date("2026-10-27T04:59:00Z"), veces = 0;
  const revisar = crearRevisionDiaria({ ahora: () => fecha, ejecutar: async () => { veces++; } });
  await Promise.all([revisar(), revisar()]);
  assert.equal(veces, 1);
  await revisar(); assert.equal(veces, 1);
  fecha = new Date("2026-10-27T05:00:00Z");
  assert.equal(diaBogota(fecha), "2026-10-27");
  await revisar(); assert.equal(veces, 2);
  await revisar(true); assert.equal(veces, 3);
});
test("si la impresora estaba apagada vuelve a revisar al minuto siguiente", async () => {
  let fecha = new Date("2026-10-26T12:00:00Z"), veces = 0;
  const revisar = crearRevisionDiaria({ ahora: () => fecha, ejecutar: async () => { if (++veces === 1) throw Error("Apagada"); } });
  await assert.rejects(revisar(), /Apagada/);
  await revisar(); assert.equal(veces, 1);
  fecha = new Date(fecha.getTime() + 60000);
  await revisar(); assert.equal(veces, 2);
});
