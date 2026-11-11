import { Module } from '@nestjs/common';
import { AnimalesService } from './animales.service';
import { AnimalesController } from './animales.controller';
import { CatalogosController } from '../catalogos/catalogos.controller';
import { ImportadorService } from './importador.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AnimalesController, CatalogosController],
  providers: [AnimalesService, ImportadorService],
  exports: [AnimalesService],
})
export class AnimalesModule {}
