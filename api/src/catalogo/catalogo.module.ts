import { Module } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import { CatalogoController } from './catalogo.controller';
import { CatalogoPublicoController } from './catalogo-publico.controller';

@Module({
  controllers: [CatalogoController, CatalogoPublicoController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
