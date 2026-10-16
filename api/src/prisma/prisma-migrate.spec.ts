const { conexionMigraciones } = require('../../scripts/prisma-migrate.cjs');
describe('Conexión aislada para migraciones', () => {
  it('usa el endpoint directo de Neon conservando credenciales y SSL', () => {
    const url = new URL(conexionMigraciones({ DATABASE_URL: 'postgresql://usuario:clave@ep-ejemplo-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true' }));
    expect(url.hostname).toBe('ep-ejemplo.c-7.us-east-2.aws.neon.tech');
    expect(url.username).toBe('usuario'); expect(url.password).toBe('clave');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.has('pgbouncer')).toBe(false);
  });
  it('respeta una conexión directa configurada explícitamente', () => {
    expect(new URL(conexionMigraciones({ DATABASE_URL: 'postgresql://u:p@pool.example/db', DIRECT_DATABASE_URL: 'postgresql://u:p@direct.example/db?sslmode=require' })).hostname).toBe('direct.example');
  });
  it('no cambia el destino de otros proveedores ni la variable original', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@db.example/db' };
    expect(conexionMigraciones(env)).toBe(env.DATABASE_URL);
    expect(env.DATABASE_URL).toBe('postgresql://u:p@db.example/db');
  });
  it('rechaza configuración ausente', () => expect(() => conexionMigraciones({})).toThrow());
});
