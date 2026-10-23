import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { sumarMeses, suscripcionSuspendida } from '../suscripciones/fechas';
import { SedesProvisionService } from '../prisma/sedes-provision.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Optional() private readonly sedes?: SedesProvisionService,
  ) {}

  async login(email: string, password: string, sucursalId?: number) {
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 250 || password.length > 500) throw new UnauthorizedException('Credenciales inválidas');
    if (sucursalId !== undefined && (!Number.isSafeInteger(sucursalId) || sucursalId < 1)) throw new UnauthorizedException('Sede inválida');
    if (this.prisma.control) await this.prisma.estadoAislamiento();
    let usuario: any;
    let sedeElegida: number | undefined;
    if (this.prisma.aislamientoActivo) {
      const root = await this.prisma.control.usuario.findUnique({ where: { email }, include: { empresa:true, sucursal:true, distribuidor:true } });
      if (root?.rol === 'SUPERADMIN' && root.activo && await bcrypt.compare(password,root.password)) usuario = root;
      else {
        const sedes = await this.prisma.control.baseSede.findMany({ where: { estado:'ACTIVA', ...(sucursalId ? { sucursalId } : {}) } });
        const coincidencias: { usuario:any; sucursalId:number }[] = [];
        let fallos = false;
        for (const sede of sedes) {
          try {
            const scope = await this.prisma.contexto(sede.empresaId,sede.sucursalId);
            const candidato = await scope.cliente.usuario.findUnique({ where:{email}, include:{empresa:true,sucursal:true,distribuidor:true} });
            if (!candidato || candidato.rol === 'SUPERADMIN' || !candidato.activo || candidato.empresaId !== sede.empresaId || !candidato.empresa?.activo) continue;
            if (candidato.sucursalId != null && candidato.sucursalId !== sede.sucursalId && !['ADMIN_EMPRESA','GERENTE'].includes(candidato.rol)) continue;
            if (await bcrypt.compare(password,candidato.password)) coincidencias.push({usuario:candidato,sucursalId:sede.sucursalId});
          } catch { fallos = true; }
        }
        if (coincidencias.length > 1) throw new ConflictException({ error:'SEDE_REQUERIDA', message:'Selecciona la sede para iniciar sesión', sedes:coincidencias.map(c=>({id:c.sucursalId,nombre:c.usuario.sucursal?.nombre || 'Sede',empresa:c.usuario.empresa?.nombre})) });
        if (coincidencias.length === 1) { usuario=coincidencias[0].usuario; sedeElegida=coincidencias[0].sucursalId; }
        else if (fallos) throw new ServiceUnavailableException('No se pudo consultar la sede. Intenta nuevamente.');
      }
    } else usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { empresa: true, sucursal: true, distribuidor: true },
    });

    if (
      !usuario ||
      !usuario.activo ||
      (usuario.empresa &&
        !usuario.empresa.activo &&
        usuario.rol !== 'SUPERADMIN')
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (usuario.rol !== 'SUPERADMIN' && suscripcionSuspendida(usuario.empresa)) {
      throw new ForbiddenException({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'La suscripción venció y finalizaron los cinco días de plazo. Renueva el pago o contacta a PowerPOS para restablecer el acceso.',
      });
    }

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalId: sedeElegida ?? usuario.sucursalId,
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
        sucursalId: sedeElegida ?? usuario.sucursalId,
        plan: usuario.empresa?.plan,
        tipoNegocio: usuario.empresa?.tipoNegocio,
        permisos: usuario.empresa?.permisos,
        permisosUsuario: usuario.permisos,
        modoPreparacion: usuario.empresa?.modoPreparacion,
        facturacionElectronicaHabilitada:
          usuario.empresa?.facturacionElectronicaHabilitada,
        consumoEmpleadosHabilitado: usuario.empresa?.consumoEmpleadosHabilitado,
        catalogoHabilitado: usuario.empresa?.catalogoHabilitado,
        tiendaSlug: usuario.empresa?.tiendaSlug,
        distribuidorId: usuario.distribuidorId,
        distribuidorCodigo: usuario.distribuidor?.codigo,
        distribuidorComision: usuario.distribuidor
          ? Number(usuario.distribuidor.porcentajeComision)
          : undefined,
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

    // Empresa, sucursal y administrador deben confirmarse juntos.
    const registrada = await this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nombre: datos.empresa.nombre,
          nit: datos.empresa.nit,
          email: datos.empresa.email,
          telefono: datos.empresa.telefono,
          suscripcionVenceEn: new Date(),
          soporteIncluidoHasta: sumarMeses(new Date(), 3),
          sucursales: {
            create: {
              nombre: 'Sucursal Principal',
              activo: !this.prisma.aislamientoActivo,
            },
          },
        },
        include: { sucursales: true },
      });

      const sucursalPrincipal = empresa.sucursales[0];

      await tx.usuario.create({
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
    });
    if (this.prisma.aislamientoActivo) {
      if (!this.sedes) throw new ServiceUnavailableException('La empresa está registrada y pendiente de activar su base');
      await this.sedes.preparar(registrada.empresa.id, registrada.sucursal.id);
    }
    return registrada;
  }
}
