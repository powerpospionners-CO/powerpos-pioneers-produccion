import { Module } from '@nestjs/common';
import { PreparacionesService } from './preparaciones.service';
import { PreparacionesController } from './preparaciones.controller';

@Module({
  controllers: [PreparacionesController],
  providers: [PreparacionesService],
  exports: [PreparacionesService],
})
export class PreparacionesModule {}
