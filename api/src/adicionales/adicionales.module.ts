import { Module } from '@nestjs/common';
import { AdicionalesService } from './adicionales.service';
import { AdicionalesController } from './adicionales.controller';

@Module({
  controllers: [AdicionalesController],
  providers: [AdicionalesService],
  exports: [AdicionalesService],
})
export class AdicionalesModule {}
