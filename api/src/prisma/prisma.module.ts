import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SedesProvisionService } from './sedes-provision.service';

@Global()
@Module({
  providers: [PrismaService, SedesProvisionService],
  exports: [PrismaService, SedesProvisionService],
})
export class PrismaModule {}
