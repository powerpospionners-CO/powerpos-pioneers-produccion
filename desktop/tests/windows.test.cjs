const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { enviarWindows } = require("../windows.cjs");
test("envía RAW mediante argumentos separados y elimina el documento temporal", async () => {
  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), "powerpos-test-"));
  try {
    const nombre = 'Termica " & $(no-ejecutar)';
    let llamadas = 0;
    await enviarWindows(nombre, Buffer.from("recibo"), { temporal, ejecutar: (exe, args, options, callback) => {
      llamadas++;
      assert.ok(exe.endsWith("powershell.exe"));
      assert.equal(args[args.indexOf("-PrinterName") + 1], nombre);
      assert.equal(options.windowsHide, true);
      assert.equal(options.shell, undefined);
      fs.readFile(args.at(-1), "utf8").then((texto) => {
        assert.equal(texto, "recibo"); callback(null, '{"enviado":true}');
      }).catch(callback);
    } });
    assert.equal(llamadas, 1);
    assert.deepEqual(await fs.readdir(temporal), []);
  } finally { await fs.rmdir(temporal); }
});
test("no reintenta cuando el spooler pierde la confirmación", async () => {
  let llamadas = 0;
  await assert.rejects(enviarWindows("Termica", Buffer.from("recibo"), { ejecutar: (_exe, _args, _options, callback) => {
    llamadas++; callback(Error("timeout"), "");
  } }), (e) => e.antesDeEnviar === false && /Revisa/.test(e.message));
  assert.equal(llamadas, 1);
});
test("rechaza nombres y documentos inválidos antes de iniciar PowerShell", async () => {
  for (const nombre of ["", "\nTermica", "x".repeat(257)])
    await assert.rejects(enviarWindows(nombre, Buffer.from("recibo"), { ejecutar: () => assert.fail("No debe ejecutarse") }));
});
