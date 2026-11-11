import { Module } from '@nestjs/common';
import { FincasController } from './fincas.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FincasController],
})
export class FincasModule {}
