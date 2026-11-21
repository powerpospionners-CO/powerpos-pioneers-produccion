// Arranque exclusivo del sitio de capacitación. Nunca carga .env ni respaldos.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validarCapacitacion } = require('../dist/src/seguridad/capacitacion');
const bcrypt = require('bcrypt');
validarCapacitacion(process.env);
if (process.env.CAPACITACION !== 'true' || !process.env.CAPACITACION_PASSWORD || process.env.CAPACITACION_PASSWORD.length < 16)
  throw Error('Se requiere el modo y la contraseña exclusivos de capacitación');
const { PrismaClient } = require('../dist/generated/prisma-mysql');
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } }, log: [] });

async function preparar() {
  const tablas = await db.$queryRawUnsafe('SHOW TABLES');
  if (!tablas.length) {
    const r = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--schema', 'prisma/mysql/schema.prisma', '--skip-generate'], {
      cwd: path.resolve(__dirname, '..'), stdio: 'inherit', env: { ...process.env, MYSQL_DATABASE_URL: process.env.DATABASE_URL },
    });
    if (r.status !== 0) throw Error('No se pudo preparar el esquema de capacitación');
  }
  const empresas = await db.empresa.findMany({ select: { id: true, nit: true } });
  if (empresas.length) {
    if (empresas.length !== 1 || empresas[0].id !== 1 || empresas[0].nit !== 'CAPACITACION-NO-FISCAL')
      throw Error('La base contiene información ajena a capacitación');
    const aislamiento = await db.controlAislamiento.findUnique({where:{id:1}});
    if (aislamiento?.activo) throw Error('La capacitación no admite conexiones a sedes externas');
    return;
  }
  const password = await bcrypt.hash(process.env.CAPACITACION_PASSWORD, 10);
  await db.$transaction(async tx => {
    await tx.empresa.create({ data: {
      id: 1, nombre: 'TRAILER DEL SABOR - CAPACITACION', nit: 'CAPACITACION-NO-FISCAL', email: 'admin@capacitacion.example.test',
      direccion: 'ENTORNO DE PRUEBAS - SIN VALIDEZ COMERCIAL', tipoNegocio: 'RESTAURANTE', modoPreparacion: 'COMANDAS', plan: 'PREMIUM',
      pagoExonerado: true, motivoExoneracion: 'Datos ficticios de capacitación', facturacionElectronicaHabilitada: false,
      permisos: { pos:true, dashboard:true, productos:true, inventario:true, clientes:true, financiero:true, reportes:true, cocina:true, configuracion:true, administracion:true },
      tiendaSlug: 'trailer-practica', tiendaConfig: { publicada:false, pedidosHabilitados:false },
    } });
    await tx.sucursal.create({ data: { id:1, empresaId:1, nombre:'Sede de capacitación', direccion:'DATOS FICTICIOS', baseEfectivoCaja:100000 } });
    for (const [nombre, email, rol] of [
      ['Administrador de práctica','admin@capacitacion.example.test','ADMIN_EMPRESA'],
      ['Caja de práctica','caja@capacitacion.example.test','CAJERO'],
      ['Cocina de práctica','cocina@capacitacion.example.test','COCINERO'],
    ]) await tx.usuario.create({ data:{ empresaId:1, sucursalId:1, nombre, email, rol, password } });
    const hamburguesas = await tx.categoria.create({data:{empresaId:1,nombre:'Hamburguesas'}});
    const perros = await tx.categoria.create({data:{empresaId:1,nombre:'Perros'}});
    const bebidas = await tx.categoria.create({data:{empresaId:1,nombre:'Bebidas'}});
    const pan = await tx.ingrediente.create({data:{empresaId:1,nombre:'Pan de hamburguesa (prueba)',unidad:'unidad',stock:50,stockMinimo:10,costoUnitario:1500}});
    const carne = await tx.ingrediente.create({data:{empresaId:1,nombre:'Carne (prueba)',unidad:'gramos',stock:10000,stockMinimo:1000,costoUnitario:25}});
    const queso = await tx.ingrediente.create({data:{empresaId:1,nombre:'Queso (prueba)',unidad:'unidad',stock:100,stockMinimo:10,costoUnitario:1000}});
    const hamburguesa = await tx.producto.create({data:{empresaId:1,categoriaId:hamburguesas.id,nombre:'Hamburguesa de práctica',precio:18000,costo:6250,
      ingredientes:{create:[{ingredienteId:pan.id,cantidad:1},{ingredienteId:carne.id,cantidad:150},{ingredienteId:queso.id,cantidad:1}]}}});
    await tx.producto.create({data:{empresaId:1,categoriaId:perros.id,nombre:'Perro de práctica',precio:12000,costo:5000,controlaStock:true,stockActual:30,stockMinimo:5}});
    await tx.producto.create({data:{empresaId:1,categoriaId:bebidas.id,nombre:'Gaseosa de práctica',precio:4000,costo:2200,controlaStock:true,stockActual:24,stockMinimo:6}});
    const adicional=await tx.adicional.create({data:{empresaId:1,nombre:'Queso extra de práctica',precio:2500,ingredienteId:queso.id,cantidad:1}});
    await tx.productoAdicional.create({data:{productoId:hamburguesa.id,adicionalId:adicional.id}});
    await tx.cliente.create({data:{empresaId:1,nombre:'Cliente de práctica',documento:'CLIENTE-PRUEBA-001'}});
    await tx.auditoria.create({data:{empresaId:1,accion:'CREAR',entidad:'CAPACITACION',detalle:{datosFicticios:true,version:1}}});
  });
  console.log('Capacitación inicializada con datos ficticios; impresión física mediante agente propio.');
}
preparar().then(async()=>{await db.$disconnect(); require('../dist/src/main');}).catch(async e=>{
  console.error('No se inició capacitación:', ['La base contiene información ajena a capacitación','La capacitación no admite conexiones a sedes externas'].includes(e.message)?e.message:e.code||e.name);
  await db.$disconnect(); process.exitCode=1;
});
