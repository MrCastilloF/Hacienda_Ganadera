/**
 * Categoría del hato: derivada, nunca editada a mano (AMB-07).
 *
 * Se calcula con sexo + edad + estado productivo. Si el animal no tiene fecha de
 * nacimiento, se devuelve `SIN_CATEGORIA` en vez de inventar una edad: mostrar
 * una categoría falsa afectaría inventario y reportes.
 */
export type Sexo = 'MACHO' | 'HEMBRA';

export interface DatosCategoria {
  sexo: Sexo;
  fechaNacimiento?: Date | string | null;
  estadoProductivo?: string | null;
  /** Fecha de referencia para calcular la edad (por defecto, hoy). */
  referencia?: Date;
}

export interface CategoriaCalculada {
  codigo: string;
  nombre: string;
  edadMeses: number | null;
  /** Motivo por el que no se pudo derivar (null si se derivó). */
  motivo?: string;
}

/**
 * Edad en meses CALENDARIO, no en días divididos por un promedio.
 *
 * Dividir días entre 30,4375 desviaba los límites: un animal nacido el mismo día
 * doce meses atrás daba 11 meses y se clasificaba como ternero. Lo detectó una
 * prueba de límites; la función SQL `app.edad_meses` usa el mismo criterio.
 */
export function edadEnMeses(
  fechaNacimiento: Date | string | null | undefined,
  referencia: Date = new Date(),
): number | null {
  if (!fechaNacimiento) return null;

  const nacimiento = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;
  if (nacimiento.getTime() > referencia.getTime()) return null;

  let meses =
    (referencia.getFullYear() - nacimiento.getFullYear()) * 12 +
    (referencia.getMonth() - nacimiento.getMonth());

  // Si aún no se ha cumplido el día del mes, todavía no es un mes completo.
  if (referencia.getDate() < nacimiento.getDate()) meses -= 1;

  return Math.max(0, meses);
}

export function calcularCategoria(datos: DatosCategoria): CategoriaCalculada {
  const edadMeses = edadEnMeses(datos.fechaNacimiento, datos.referencia ?? new Date());
  const productivo = (datos.estadoProductivo ?? '').trim().toUpperCase();

  if (edadMeses === null) {
    return {
      codigo: 'SIN_CATEGORIA',
      nombre: 'Sin categoría (falta fecha de nacimiento)',
      edadMeses: null,
      motivo: 'FALTA_FECHA_NACIMIENTO',
    };
  }

  if (datos.sexo === 'HEMBRA') {
    if (edadMeses < 12) return { codigo: 'TERNERA', nombre: 'Ternera', edadMeses };
    if (edadMeses < 24) return { codigo: 'NOVILLA', nombre: 'Novilla', edadMeses };
    return { codigo: 'VACA', nombre: 'Vaca', edadMeses };
  }

  if (edadMeses < 12) return { codigo: 'TERNERO', nombre: 'Ternero', edadMeses };
  if (edadMeses < 24) return { codigo: 'NOVILLO', nombre: 'Novillo', edadMeses };

  // Macho adulto: solo es toro si está destinado a reproducción.
  if (['REPRODUCTOR', 'TORO', 'REPRODUCCION'].includes(productivo)) {
    return { codigo: 'TORO', nombre: 'Toro', edadMeses };
  }
  return { codigo: 'CEBA', nombre: 'Ceba', edadMeses };
}
