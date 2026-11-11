import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { RateLimiterService } from '../common/rate-limiter.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    RbacModule,
    AuditModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        privateKey: config.jwt.privateKey,
        publicKey: config.jwt.publicKey,
        signOptions: { algorithm: 'RS256', issuer: config.jwt.issuer, audience: config.jwt.audience },
        verifyOptions: { algorithms: ['RS256'], issuer: config.jwt.issuer, audience: config.jwt.audience },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: PasswordService,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new PasswordService(config),
    },
    TokenService,
    AuthService,
    RateLimiterService,
    JwtAuthGuard,
  ],
  exports: [AuthService, TokenService, RateLimiterService, PasswordService, JwtAuthGuard],
})
export class AuthModule {}
