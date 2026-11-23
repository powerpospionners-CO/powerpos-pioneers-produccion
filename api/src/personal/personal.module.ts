import { Module } from '@nestjs/common';
import { FinancieroModule } from '../financiero/financiero.module';
import {
  PersonalController,
  PersonalFirmaController,
  PersonalFirmaGuard,
} from './personal.controller';
import { PersonalService } from './personal.service';
import { PersonalStore } from './personal.store';
import { RolesGuard } from '../auth/roles.guard';
import { ContratoEditorService } from './contrato-editor.service';
@Module({
  imports: [FinancieroModule],
  controllers: [PersonalController, PersonalFirmaController],
  providers: [
    PersonalService,
    PersonalStore,
    PersonalFirmaGuard,
    RolesGuard,
    ContratoEditorService,
  ],
})
export class PersonalModule {}
