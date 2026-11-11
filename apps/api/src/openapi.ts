import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export const DOCS_PATH = 'api/docs';

/**
 * Documento OpenAPI 3.1 generado desde el código (RF-ARQ / RNF-MAN-04).
 * No se escribe a mano: si un endpoint no está en este documento, no existe.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Hacienda Ganadera — API')
    .setDescription(
      [
        'API de la plataforma de administración, trazabilidad y monitoreo de una hacienda ganadera.',
        '',
        '**Autenticación**: `Bearer <accessToken>` (JWT RS256, 15 min). El refresco es rotativo y de un solo uso.',
        '',
        '**Errores**: toda respuesta de error tiene la forma `{ error: { code, message, details?, requestId } }`.',
        'El `requestId` permite correlacionar con los logs y con la auditoría.',
        '',
        '**Auditoría**: toda operación que muta estado queda registrada en una cadena de hashes verificable',
        'mediante `GET /api/v1/auditoria/verificar`.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token de acceso' },
      'bearer',
    )
    .addTag('autenticación', 'Inicio de sesión, refresco, segundo factor y contraseña')
    .addTag('usuarios', 'Administración de usuarios y roles')
    .addTag('fincas', 'Predios dentro del alcance del usuario')
    .addTag('auditoría', 'Eventos de auditoría y verificación de la cadena de hashes')
    .addTag('salud', 'Sondas de vida y disponibilidad')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/i, '').toLowerCase()}_${methodKey}`,
  });
}
