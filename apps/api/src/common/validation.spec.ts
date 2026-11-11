import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, ErrorCode } from './app-error';
import { parseBody, parseQuery } from './validation';

describe('AppError', () => {
  it('conserva código, estado y mensaje', () => {
    const error = AppError.forbidden('sin permiso');
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(error.status).toBe(403);
    expect(error.message).toBe('sin permiso');
    expect(error.expose).toBe(true);
  });

  it('oculta el detalle de los errores internos', () => {
    const error = AppError.internal('fallo de base', new Error('detalle técnico'));
    expect(error.status).toBe(500);
    expect(error.expose).toBe(false);
  });

  it('permite adjuntar detalles de validación', () => {
    const error = AppError.validation('datos inválidos', [{ campo: 'email' }]);
    expect(error.status).toBe(400);
    expect(error.details).toEqual([{ campo: 'email' }]);
  });
});

describe('validación con Zod', () => {
  const Esquema = z.object({
    email: z.string().email(),
    edad: z.coerce.number().int().min(0).default(0),
  });

  it('aplica los valores por defecto del esquema', () => {
    const value = parseBody(Esquema, { email: 'a@b.co' });
    expect(value).toEqual({ email: 'a@b.co', edad: 0 });
  });

  it('convierte tipos de la cadena de consulta', () => {
    const query = parseQuery(z.object({ limit: z.coerce.number().default(10) }), { limit: '25' });
    expect(query.limit).toBe(25);
  });

  it('lanza un error de validación con los campos afectados', () => {
    try {
      parseBody(Esquema, { email: 'no-es-correo' });
      expect.unreachable('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(appError.status).toBe(400);
      expect(Array.isArray(appError.details)).toBe(true);
      expect((appError.details as Array<{ campo: string }>)[0]?.campo).toBe('email');
    }
  });

  it('trata el cuerpo vacío como un objeto vacío', () => {
    expect(() => parseBody(Esquema, undefined)).toThrow(AppError);
  });
});
