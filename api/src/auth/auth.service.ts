import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { empresa: true, sucursal: true },
    });

    if (!usuario || !usuario.activo || (usuario.empresa && !usuario.empresa.activo && usuario.rol !== 'SUPERADMIN')) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        empresa: usuario.empresa?.nombre,
        sucursal: usuario.sucursal?.nombre,
        empresaId: usuario.empresaId,
        sucursalId: usuario.sucursalId,
        plan: usuario.empresa?.plan,
        tipoNegocio: usuario.empresa?.tipoNegocio,
        permisos: usuario.empresa?.permisos,
        modoPreparacion: usuario.empresa?.modoPreparacion,
        facturacionElectronicaHabilitada: usuario.empresa?.facturacionElectronicaHabilitada,
        consumoEmpleadosHabilitado: usuario.empresa?.consumoEmpleadosHabilitado,
        catalogoHabilitado: usuario.empresa?.catalogoHabilitado,
        tiendaSlug: usuario.empresa?.tiendaSlug,
      },
    };
  }

  async registrarEmpresa(datos: {
    empresa: { nombre: string; nit: string; email: string; telefono?: string };
    admin: { nombre: string; email: string; password: string };
  }) {
    const empresaExiste = await this.prisma.empresa.findUnique({
      where: { nit: datos.empresa.nit },
    });

    if (empresaExiste) {
      throw new ConflictException('Ya existe una empresa con ese NIT');
    }

    const usuarioExiste = await this.prisma.usuario.findUnique({
      where: { email: datos.admin.email },
    });

    if (usuarioExiste) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const passwordHash = await bcrypt.hash(datos.admin.password, 10);

    // Se crea la empresa junto con su Sucursal Principal en la misma transacción
    const empresa = await this.prisma.empresa.create({
      data: {
        nombre: datos.empresa.nombre,
        nit: datos.empresa.nit,
        email: datos.empresa.email,
        telefono: datos.empresa.telefono,
        sucursales: {
          create: {
            nombre: 'Sucursal Principal',
          },
        },
      },
      include: { sucursales: true },
    });

    const sucursalPrincipal = empresa.sucursales[0];

    const admin = await this.prisma.usuario.create({
      data: {
        nombre: datos.admin.nombre,
        email: datos.admin.email,
        password: passwordHash,
        rol: 'ADMIN_EMPRESA',
        empresaId: empresa.id,
        sucursalId: sucursalPrincipal.id,
      },
    });

    return {
      mensaje: 'Empresa registrada exitosamente',
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        tiendaRuta: `/tienda/${empresa.tiendaSlug}`,
        nit: empresa.nit,
      },
      sucursal: {
        id: sucursalPrincipal.id,
        nombre: sucursalPrincipal.nombre,
      },
    };
  }
}
