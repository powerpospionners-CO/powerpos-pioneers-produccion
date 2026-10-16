import { ReportesController } from './reportes.controller';
import { excelReport } from '../common/excel-report';

jest.mock('../common/excel-report', () => ({ excelReport: jest.fn().mockResolvedValue(Buffer.from('xlsx')) }));

describe('Report downloads', () => {
  const req = { user: { empresaId: 47 } };
  let reports: any;
  let stats: any;
  let response: any;
  let controller: ReportesController;
  beforeEach(() => {
    jest.clearAllMocks();
    reports = {
      rendimientoPorEmpleado: jest.fn().mockResolvedValue([]), mejoresClientes: jest.fn().mockResolvedValue([]),
      rentabilidadPorProducto: jest.fn().mockResolvedValue([]),
      comparativaPorPeriodo: jest.fn().mockResolvedValue({ semana: { actual: { total: 0, cantidadPedidos: 0 }, anterior: { total: 0 } }, mes: { actual: { total: 0, cantidadPedidos: 0 }, anterior: { total: 0 } } }),
    };
    stats = { consultar: jest.fn() };
    response = { setHeader: jest.fn(), send: jest.fn() };
    controller = new ReportesController(reports, stats, {} as any);
  });
  it('uses the authenticated company for every report dataset', async () => {
    await controller.exportar(req, response);
    expect(reports.rendimientoPorEmpleado).toHaveBeenCalledWith(47);
    expect(reports.mejoresClientes).toHaveBeenCalledWith(47, 10);
    expect(reports.comparativaPorPeriodo).toHaveBeenCalledWith(47);
    expect(reports.rentabilidadPorProducto).toHaveBeenCalledWith(47);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.send).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });
  it('reuses statistics validation and passes applied dates and branch', async () => {
    stats.consultar.mockRejectedValue(new Error('Sucursal no autorizada'));
    await expect(controller.exportarEstadisticas(req, response, '2026-10-01', '2026-10-15', '5')).rejects.toThrow('Sucursal no autorizada');
    expect(stats.consultar).toHaveBeenCalledWith(47, '2026-10-01', '2026-10-15', '5');
    expect(excelReport).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });
});
