import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpiar tablas en orden correcto
  await prisma.detallePedidoAdicional.deleteMany();
  await prisma.detallePedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.productoAdicional.deleteMany();
  await prisma.adicional.deleteMany();
  await prisma.productoIngrediente.deleteMany();
  await prisma.ingrediente.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.sucursal.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.empresa.deleteMany();

  console.log('🧹 Base de datos limpiada');

  // Empresa
  const empresa = await prisma.empresa.create({
    data: {
      nombre: 'Tráiler Don Juancho',
      nit: '900123456-1',
      email: 'admin@donjuancho.com',
      telefono: '3001234567',
      modoPreparacion: 'COMANDAS',
    },
  });

  // Admin
  const passwordHash = await bcrypt.hash('Admin123*', 10);
  await prisma.usuario.create({
    data: {
      nombre: 'Juan Carlos López',
      email: 'juan@donjuancho.com',
      password: passwordHash,
      rol: 'ADMIN_EMPRESA',
      empresaId: empresa.id,
    },
  });

  if (process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD) {
    const superadminPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 10);
    await prisma.usuario.create({
      data: {
        nombre: process.env.SUPERADMIN_NAME || 'Administrador del sistema',
        email: process.env.SUPERADMIN_EMAIL,
        password: superadminPassword,
        rol: 'SUPERADMIN',
        permisos: { global: true },
      },
    });
    console.log(`✅ Superadmin creado: ${process.env.SUPERADMIN_EMAIL}`);
  }

  // Sucursal
  await prisma.sucursal.create({
    data: {
      nombre: 'Sucursal Principal',
      direccion: 'Calle 10 # 5-23, Centro',
      telefono: '3001234567',
      empresaId: empresa.id,
    },
  });

  // Categorías
  const catHamburguesas = await prisma.categoria.create({
    data: { nombre: 'Hamburguesas', descripcion: 'Hamburguesas clásicas y especiales', icono: '🍔', color: '#FF6B35', empresaId: empresa.id },
  });
  const catPerros = await prisma.categoria.create({
    data: { nombre: 'Perros Calientes', descripcion: 'Perros calientes tradicionales', icono: '🌭', color: '#FFB347', empresaId: empresa.id },
  });
  const catBebidas = await prisma.categoria.create({
    data: { nombre: 'Bebidas', descripcion: 'Gaseosas, jugos y agua', icono: '🥤', color: '#4FC3F7', empresaId: empresa.id },
  });

  // Hamburguesa Clásica
  const hamburguesa = await prisma.producto.create({
    data: { nombre: 'Hamburguesa Clásica', descripcion: 'Hamburguesa con carne, lechuga, tomate y salsa', precio: 12000, categoriaId: catHamburguesas.id, empresaId: empresa.id },
  });

  const ingredientesHamburguesa = [
    { nombre: 'Pan de hamburguesa', unidad: 'unidad', cantidad: 1, stock: 100, stockMinimo: 20, unidadCompra: 'paquete', factorConversion: 12 },
    { nombre: 'Carne de res', unidad: 'gramos', cantidad: 150, stock: 5000, stockMinimo: 500 },
    { nombre: 'Lechuga', unidad: 'gramos', cantidad: 30, stock: 1000, stockMinimo: 200 },
    { nombre: 'Tomate', unidad: 'gramos', cantidad: 40, stock: 2000, stockMinimo: 300 },
    { nombre: 'Salsa especial', unidad: 'gramos', cantidad: 20, stock: 500, stockMinimo: 100 },
    { nombre: 'Cebolla', unidad: 'gramos', cantidad: 25, stock: 1000, stockMinimo: 200 },
    { nombre: 'Jalapeños', unidad: 'gramos', cantidad: 15, stock: 300, stockMinimo: 50 },
  ];

  for (const ing of ingredientesHamburguesa) {
    const ingrediente = await prisma.ingrediente.create({
      data: {
        empresaId: empresa.id,
        nombre: ing.nombre,
        unidad: ing.unidad,
        stock: ing.stock,
        stockMinimo: ing.stockMinimo,
        unidadCompra: ing.unidadCompra || null,
        factorConversion: ing.factorConversion ?? null,
      },
    });
    await prisma.productoIngrediente.create({
      data: { productoId: hamburguesa.id, ingredienteId: ingrediente.id, cantidad: ing.cantidad },
    });
  }
  console.log('✅ Hamburguesa Clásica creada');

  // Adicionales (extras con costo)
  const quesoExtra = await prisma.ingrediente.create({
    data: { empresaId: empresa.id, nombre: 'Queso extra', unidad: 'lonchas', stock: 400, stockMinimo: 60, costoUnitario: 350 },
  });
  const tocinetaExtra = await prisma.ingrediente.create({
    data: { empresaId: empresa.id, nombre: 'Tocineta', unidad: 'gramos', stock: 2000, stockMinimo: 300, costoUnitario: 25 },
  });

  const adExtraQueso = await prisma.adicional.create({
    data: { empresaId: empresa.id, nombre: 'Extra queso', precio: 2000, ingredienteId: quesoExtra.id, cantidad: 1 },
  });
  const adTocineta = await prisma.adicional.create({
    data: { empresaId: empresa.id, nombre: 'Tocineta', precio: 3000, ingredienteId: tocinetaExtra.id, cantidad: 30 },
  });
  const adDobleCarne = await prisma.adicional.create({
    data: { empresaId: empresa.id, nombre: 'Doble carne', precio: 5000 },
  });

  await prisma.productoAdicional.createMany({
    data: [
      { productoId: hamburguesa.id, adicionalId: adExtraQueso.id },
      { productoId: hamburguesa.id, adicionalId: adTocineta.id },
      { productoId: hamburguesa.id, adicionalId: adDobleCarne.id },
    ],
  });
  console.log('✅ Adicionales creados y asociados a la Hamburguesa');

  // Perro Caliente
  const perro = await prisma.producto.create({
    data: { nombre: 'Perro Caliente Especial', descripcion: 'Perro caliente con salchicha y papas', precio: 8000, categoriaId: catPerros.id, empresaId: empresa.id },
  });

  const ingredientesPerro = [
    { nombre: 'Pan de perro', unidad: 'unidad', cantidad: 1, stock: 100, stockMinimo: 20, unidadCompra: 'paquete', factorConversion: 10 },
    { nombre: 'Salchicha', unidad: 'unidad', cantidad: 1, stock: 200, stockMinimo: 30 },
    { nombre: 'Papas fritas', unidad: 'gramos', cantidad: 100, stock: 3000, stockMinimo: 500 },
    { nombre: 'Mostaza', unidad: 'gramos', cantidad: 15, stock: 500, stockMinimo: 100 },
    { nombre: 'Ketchup', unidad: 'gramos', cantidad: 15, stock: 500, stockMinimo: 100 },
  ];

  for (const ing of ingredientesPerro) {
    const ingrediente = await prisma.ingrediente.create({
      data: {
        empresaId: empresa.id,
        nombre: ing.nombre,
        unidad: ing.unidad,
        stock: ing.stock,
        stockMinimo: ing.stockMinimo,
        unidadCompra: ing.unidadCompra || null,
        factorConversion: ing.factorConversion ?? null,
      },
    });
    await prisma.productoIngrediente.create({
      data: { productoId: perro.id, ingredienteId: ingrediente.id, cantidad: ing.cantidad },
    });
  }
  console.log('✅ Perro Caliente creado');

  // Bebidas — no aceptan adicionales
  await prisma.producto.create({
    data: { nombre: 'Gaseosa', descripcion: 'Gaseosa fría 350ml', precio: 3000, categoriaId: catBebidas.id, empresaId: empresa.id, aceptaAdicionales: false },
  });
  await prisma.producto.create({
    data: { nombre: 'Agua', descripcion: 'Agua fría 500ml', precio: 2000, categoriaId: catBebidas.id, empresaId: empresa.id, aceptaAdicionales: false },
  });
  console.log('✅ Bebidas creadas');

  console.log('🎉 Seed completado exitosamente');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
