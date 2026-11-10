import { PlanCuentasService } from './plan-cuentas.service';

describe('Disponibilidad del arranque PUC', () => {
  const original = process.env.DATABASE_ENGINE;
  afterEach(() => { if (original === undefined) delete process.env.DATABASE_ENGINE; else process.env.DATABASE_ENGINE = original; });
  it('una sede caída no impide preparar las demás ni iniciar la API', async () => {
    process.env.DATABASE_ENGINE = 'mysql';
    const db = () => ({ $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() });
    const control = { ...db(), baseSede: { findMany: jest.fn().mockResolvedValue([{ empresaId: 3, sucursalId: 3 }, { empresaId: 2, sucursalId: 2 }]) } };
    const sana = db();
    const prisma: any = { control, estadoAislamiento: jest.fn().mockResolvedValue({ activo: true }), contexto: jest.fn().mockRejectedValueOnce(new Error('Sede inaccesible')).mockResolvedValueOnce({ cliente: sana }) };
    await expect(new PlanCuentasService(prisma).onModuleInit()).resolves.toBeUndefined();
    expect(control.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(sana.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
  it('un fallo en la base de control sí impide dar por correcto el arranque', async () => {
    process.env.DATABASE_ENGINE = 'mysql';
    const prisma: any = { control: { $executeRawUnsafe: jest.fn().mockRejectedValue(new Error('Control inaccesible')) } };
    await expect(new PlanCuentasService(prisma).onModuleInit()).rejects.toThrow('Control inaccesible');
  });
});
