import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { ClientesPublicoController } from './clientes-publico.controller';

@Module({
  controllers: [ClientesController, ClientesPublicoController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}