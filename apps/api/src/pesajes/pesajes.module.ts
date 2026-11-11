import { Module } from '@nestjs/common';
import { PesajesService } from './pesajes.service';
import { PesajesController } from './pesajes.controller';
import { BasculasController } from './basculas.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PesajesController, BasculasController],
  providers: [PesajesService],
  exports: [PesajesService],
})
export class PesajesModule {}
