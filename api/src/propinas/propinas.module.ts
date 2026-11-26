import { Global, Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { PropinasController } from './propinas.controller';
import { PropinasService } from './propinas.service';

@Global()
@Module({
  controllers: [PropinasController],
  providers: [PropinasService, RolesGuard],
  exports: [PropinasService],
})
export class PropinasModule {}
