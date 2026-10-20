import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [NotificacionesService, WhatsappService],
  controllers: [NotificacionesController, WhatsappController],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
