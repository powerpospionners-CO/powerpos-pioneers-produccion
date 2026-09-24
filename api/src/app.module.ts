import { Module } from '@nestjs/common';
import { TiendaModule } from './tienda/tienda.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CategoriasModule } from './categorias/categorias.module';
import { ProductosModule } from './productos/productos.module';
import { AdicionalesModule } from './adicionales/adicionales.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { CajaModule } from './caja/caja.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { EmpresaModule } from './empresa/empresa.module';
import { FinancieroModule } from './financiero/financiero.module';
import { InventarioModule } from './inventario/inventario.module';
import { PreparacionesModule } from './preparaciones/preparaciones.module';
import { ClientesModule } from './clientes/clientes.module';
import { TareasModule } from './tareas/tareas.module';
import { ReportesModule } from './reportes/reportes.module';
import { ImpresionModule } from './impresion/impresion.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { ConsumoEmpleadosModule } from './consumo-empleados/consumo-empleados.module';
import { CatalogoModule } from './catalogo/catalogo.module';

@Module({
  imports: [
    TiendaModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    NotificacionesModule,
    CategoriasModule,
    ProductosModule,
    AdicionalesModule,
    PedidosModule,
    SucursalesModule,
    UsuariosModule,
    CajaModule,
    EmpresaModule,
    FinancieroModule,
    InventarioModule,
    PreparacionesModule,
    ClientesModule,
    TareasModule,
    ReportesModule,
    ImpresionModule,
    SuperadminModule,
    AuditoriaModule,
    ConsumoEmpleadosModule,
    CatalogoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
