/**
 * Máquina de estados del animal (docs/01 §7).
 *
 * El estado no se edita: se transita. Cada transición produce un evento de
 * historial (append-only) y una entrada de auditoría. Un estado terminal no
 * admite salida: un animal vendido no vuelve a "activo".
 */
export const ESTADOS = [
  'activo',
  'cuarentena',
  'enfermo',
  'vendido',
  'fallecido',
  'sacrificado',
  'trasladado',
] as const;

export type EstadoAnimal = (typeof ESTADOS)[number];

export const ESTADOS_TERMINALES: readonly EstadoAnimal[] = ['vendido', 'fallecido', 'sacrificado'];

/** Transiciones permitidas: desde → hacia. */
const TRANSICIONES: Record<EstadoAnimal, readonly EstadoAnimal[]> = {
  activo: ['cuarentena', 'enfermo', 'vendido', 'fallecido', 'sacrificado', 'trasladado'],
  cuarentena: ['activo', 'enfermo', 'fallecido', 'sacrificado'],
  enfermo: ['activo', 'fallecido', 'sacrificado'],
  trasladado: ['activo'],
  vendido: [],
  fallecido: [],
  sacrificado: [],
};

/** Estados que exigen un motivo escrito por el responsable. */
const REQUIEREN_MOTIVO: readonly EstadoAnimal[] = [
  'cuarentena',
  'enfermo',
  'vendido',
  'fallecido',
  'sacrificado',
  'trasladado',
];

export interface TransicionSolicitada {
  desde: EstadoAnimal;
  hacia: EstadoAnimal;
  motivo?: string | null;
}

export type ResultadoTransicion =
  | { valida: true }
  | { valida: false; codigo: 'ESTADO_TERMINAL' | 'TRANSICION_INVALIDA' | 'MOTIVO_REQUERIDO'; mensaje: string };

export function validarTransicion({ desde, hacia, motivo }: TransicionSolicitada): ResultadoTransicion {
  if (desde === hacia) {
    return {
      valida: false,
      codigo: 'TRANSICION_INVALIDA',
      mensaje: `El animal ya está en estado "${hacia}"`,
    };
  }

  if (ESTADOS_TERMINALES.includes(desde)) {
    return {
      valida: false,
      codigo: 'ESTADO_TERMINAL',
      mensaje: `El estado "${desde}" es terminal: no admite nuevas transiciones`,
    };
  }

  const permitidas = TRANSICIONES[desde] ?? [];
  if (!permitidas.includes(hacia)) {
    return {
      valida: false,
      codigo: 'TRANSICION_INVALIDA',
      mensaje: `No se puede pasar de "${desde}" a "${hacia}"`,
    };
  }

  if (REQUIEREN_MOTIVO.includes(hacia) && (!motivo || motivo.trim().length < 3)) {
    return {
      valida: false,
      codigo: 'MOTIVO_REQUERIDO',
      mensaje: `La transición a "${hacia}" requiere un motivo (mínimo 3 caracteres)`,
    };
  }

  return { valida: true };
}

export function esTerminal(estado: EstadoAnimal): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

/** Estados en los que el animal puede recibir pesajes, tratamientos o movimientos. */
export function admiteOperaciones(estado: EstadoAnimal): boolean {
  return estado === 'activo' || estado === 'enfermo' || estado === 'cuarentena';
}

export function transicionesPosibles(estado: EstadoAnimal): readonly EstadoAnimal[] {
  return TRANSICIONES[estado] ?? [];
}
