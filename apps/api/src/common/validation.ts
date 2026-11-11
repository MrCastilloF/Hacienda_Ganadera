import { AppError } from './app-error';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validación de entrada con Zod.
 * Centralizada para que todo error de validación tenga la misma forma y el
 * mismo código (`VALIDATION_ERROR`) sin importar el endpoint.
 *
 * La firma infiere el tipo de *salida* del esquema (con los valores por defecto
 * ya aplicados), que es lo que consume el resto de la aplicación.
 */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  return parse(schema, body ?? {}, 'Los datos enviados no son válidos');
}

export function parseQuery<S extends ZodTypeAny>(schema: S, query: unknown): z.infer<S> {
  return parse(schema, query ?? {}, 'Parámetros de consulta inválidos');
}

export function parseParams<S extends ZodTypeAny>(schema: S, params: unknown): z.infer<S> {
  return parse(schema, params ?? {}, 'Parámetros de ruta inválidos');
}

function parse<S extends ZodTypeAny>(schema: S, value: unknown, message: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw AppError.validation(
      message,
      result.error.issues.map((issue) => ({
        campo: issue.path.join('.') || '(cuerpo)',
        mensaje: issue.message,
      })),
    );
  }
  return result.data as z.infer<S>;
}
