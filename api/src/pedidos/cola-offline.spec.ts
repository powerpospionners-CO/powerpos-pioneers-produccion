import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import * as ts from 'typescript';

// Ejecuta la cola real del navegador con almacenamiento y transporte aislados.
function cola() {
  const almacen = new Map<string, string>();
  const post = jest.fn();
  const exports: any = {};
  const localStorage = {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: jest.fn((k: string, v: string) => almacen.set(k, v)),
  };
  const codigo = ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, '../../../web/lib/colaOfflineVentas.ts'),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
      },
    },
  ).outputText;
  vm.runInNewContext(codigo, {
    exports,
    require: () => ({ __esModule: true, default: { post } }),
    window: { localStorage },
    navigator: {},
    crypto: {},
    Date,
    Math,
    Map,
    Set,
    Promise,
  });
  return { api: exports, post, localStorage };
}

describe('Respaldo offline del POS', () => {
  it.each(['{incompleto', '{}', '[{"clave":"a"}]'])('conserva una cola dañada y bloquea su sobrescritura: %s', contenido => {
    const { api, localStorage, post } = cola();
    const clave = 'pos-cola-offline:1:2';
    localStorage.setItem(clave, contenido);
    expect(() => api.listarVentasPendientes(1, 2)).toThrow('recuperar la cola');
    expect(() => api.encolarVentaPendiente(1, 2, 'nueva', {})).toThrow();
    expect(localStorage.getItem(clave)).toBe(contenido);
    expect(post).not.toHaveBeenCalled();
  });
  it('conserva ventas agregadas mientras otra venta se sincroniza', async () => {
    const { api, post } = cola();
    api.encolarVentaPendiente(1, 2, 'a', { total: 10 });
    post.mockImplementation(async () => {
      api.encolarVentaPendiente(1, 2, 'b', { total: 20 });
      return { data: { id: 1 } };
    });
    await api.sincronizarVentasPendientes(1, 2);
    expect(api.listarVentasPendientes(1, 2).map((v) => v.clave)).toEqual(['b']);
  });
  it.each([401, 403, 409, 429, 500, 503])(
    'mantiene pendiente una respuesta temporal %s',
    async (status) => {
      const { api, post } = cola();
      api.encolarVentaPendiente(1, 2, 'a', {});
      post.mockRejectedValue({ response: { status } });
      await api.sincronizarVentasPendientes(1, 2);
      expect(api.listarVentasPendientes(1, 2)).toHaveLength(1);
      expect(api.listarVentasFallidas(1, 2)).toHaveLength(0);
    },
  );
  it('un rechazo definitivo se conserva para revisión', async () => {
    const { api, post } = cola();
    api.encolarVentaPendiente(1, 2, 'a', {});
    post.mockRejectedValue({
      response: { status: 400, data: { message: 'Sin existencias' } },
    });
    await api.sincronizarVentasPendientes(1, 2);
    expect(api.listarVentasPendientes(1, 2)).toHaveLength(0);
    expect(api.listarVentasFallidas(1, 2)[0].motivo).toBe('Sin existencias');
  });
  it('dos sincronizaciones simultáneas comparten el mismo envío', async () => {
    const { api, post } = cola();
    api.encolarVentaPendiente(1, 2, 'a', {});
    post.mockResolvedValue({ data: { id: 1 } });
    await Promise.all([
      api.sincronizarVentasPendientes(1, 2),
      api.sincronizarVentasPendientes(1, 2),
    ]);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('no afirma respaldo cuando el almacenamiento está lleno', () => {
    const { api, localStorage } = cola();
    localStorage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => api.encolarVentaPendiente(1, 2, 'a', {})).toThrow('quota');
  });
});
