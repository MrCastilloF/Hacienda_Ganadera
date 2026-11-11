/**
 * Catálogo de medicamentos de referencia (Fase 5).
 *
 * ADVERTENCIA: los días de retiro de esta tabla son **valores de referencia
 * declarados**, no la ficha oficial de cada producto. El prospecto del fabricante
 * y el criterio del veterinario mandan. Sirven para no depender del tecleo y para
 * que el sistema pida confirmación cuando el valor difiera.
 *
 * Cuando exista el catálogo oficial (INV-01), esta constante se reemplaza por la
 * tabla correspondiente sin cambiar la API.
 */

export interface MedicamentoReferencia {
  codigo: string;
  nombre: string;
  principioActivo: string;
  /** Días de retiro de referencia para carne. `null` = desconocido, se debe pedir. */
  diasRetiroCarne: number | null;
  /** Días de retiro de referencia para leche, si aplica. */
  diasRetiroLeche: number | null;
  via: 'IM' | 'IV' | 'SC' | 'ORAL' | 'TOPICA' | 'INTRAMAMARIA' | 'OTRA';
  notas?: string;
}

export const CATALOGO_MEDICAMENTOS: readonly MedicamentoReferencia[] = [
  {
    codigo: 'OXI-LA',
    nombre: 'Oxitetraciclina de larga acción',
    principioActivo: 'Oxitetraciclina',
    diasRetiroCarne: 28,
    diasRetiroLeche: 7,
    via: 'IM',
    notas: 'Retiro de referencia; confirmar con el prospecto de la marca usada.',
  },
  {
    codigo: 'PEN-BEN',
    nombre: 'Penicilina benzatínica',
    principioActivo: 'Penicilina G',
    diasRetiroCarne: 21,
    diasRetiroLeche: 3,
    via: 'IM',
  },
  {
    codigo: 'IVM-1',
    nombre: 'Ivermectina 1%',
    principioActivo: 'Ivermectina',
    diasRetiroCarne: 35,
    diasRetiroLeche: null,
    via: 'SC',
    notas: 'No usar en vacas en producción de leche para consumo humano.',
  },
  {
    codigo: 'FLU-NX',
    nombre: 'Flunixin meglumine',
    principioActivo: 'Flunixin',
    diasRetiroCarne: 4,
    diasRetiroLeche: 2,
    via: 'IV',
  },
  {
    codigo: 'CEF-NA',
    nombre: 'Ceftiofur sódico',
    principioActivo: 'Ceftiofur',
    diasRetiroCarne: 13,
    diasRetiroLeche: 0,
    via: 'IM',
  },
  {
    codigo: 'ALB-10',
    nombre: 'Albendazol 10%',
    principioActivo: 'Albendazol',
    diasRetiroCarne: 14,
    diasRetiroLeche: 4,
    via: 'ORAL',
  },
  {
    codigo: 'DOR-1',
    nombre: 'Doramectina 1%',
    principioActivo: 'Doramectina',
    diasRetiroCarne: 35,
    diasRetiroLeche: null,
    via: 'SC',
  },
  {
    codigo: 'VAC-CLB',
    nombre: 'Vacuna clostridial',
    principioActivo: 'Toxoides clostridiales',
    diasRetiroCarne: 0,
    diasRetiroLeche: 0,
    via: 'SC',
    notas: 'Las vacunas suelen no tener retiro; confirmar con el prospecto.',
  },
] as const;

export function buscarMedicamento(codigo?: string, nombre?: string): MedicamentoReferencia | null {
  const referencia = (codigo ?? nombre ?? '').trim().toUpperCase();
  if (!referencia) return null;

  return (
    CATALOGO_MEDICAMENTOS.find((m) => m.codigo === referencia) ??
    CATALOGO_MEDICAMENTOS.find((m) => m.nombre.toUpperCase() === referencia) ??
    CATALOGO_MEDICAMENTOS.find((m) => m.nombre.toUpperCase().includes(referencia)) ??
    null
  );
}

export const AVISO_CATALOGO =
  'Los días de retiro del catálogo son valores de referencia declarados, no la ficha oficial del producto: ' +
  'prevalecen el prospecto del fabricante y el criterio del veterinario.';

export interface AlertaRetiro {
  tratamientoId: string;
  animalId: string;
  arete: string;
  medicamento: string;
  finRetiro: Date;
  diasRestantes: number;
  venceHoy: boolean;
}

/** Días restantes hasta el fin de retiro (0 si ya venció). */
export function diasHastaRetiro(finRetiro: Date, referencia: Date = new Date()): number {
  return Math.max(0, Math.ceil((finRetiro.getTime() - referencia.getTime()) / 86_400_000));
}
