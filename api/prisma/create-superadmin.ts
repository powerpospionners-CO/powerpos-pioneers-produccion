import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const nombre = process.env.SUPERADMIN_NAME || 'Administrador del sistema';

  if (!email || !password) {
    throw new Error('Configura SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en api/.env');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: { nombre, password: passwordHash, rol: 'SUPERADMIN', activo: true, empresaId: null, sucursalId: null },
    create: { nombre, email, password: passwordHash, rol: 'SUPERADMIN', permisos: { global: true } },
    select: { id: true, nombre: true, email: true, rol: true },
  });

  console.log(`Superadmin listo: ${usuario.email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
