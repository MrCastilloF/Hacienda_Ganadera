/**
 * Periodo de retiro de medicamentos (Fase 5, RF-SAL-05…08).
 *
 * Regla de negocio que este módulo protege: un animal tratado no puede venderse
 * ni sacrificarse hasta que venza el retiro. No es una advertencia en la
 * interfaz: es un bloqueo del dominio, porque de ello dependen la inocuidad de
 * la carne y la responsabilidad legal del productor.
 */

export interface RetiroCalculado {
  finTratamiento: Date;
  finRetiro: Date;
  /** Días que faltan para poder vender, contados desde la referencia. */
  diasRestantes: number;
  /** Puede venderse o sacrificarse en la fecha de referencia. */
  puedeVenderse: boolean;
  motivo?: string;
}

/**
 * Calcula el fin de tratamiento y el fin de retiro.
 *
 * `diasRetiro` se cuenta **desde el último día de tratamiento**, que es como lo
 * declara el prospecto del producto, no desde el inicio.
 */
export function calcularRetiro(input: {
  iniciadoAt: Date;
  diasTratamiento: number;
  diasRetiro: number;
  referencia?: Date;
}): RetiroCalculado {
  const referencia = input.referencia ?? new Date();
  const diasTratamiento = Math.max(1, Math.trunc(input.diasTratamiento));
  const diasRetiro = Math.max(0, Math.trunc(input.diasRetiro));

  const finTratamiento = sumarDias(input.iniciadoAt, diasTratamiento);
  const finRetiro = sumarDias(finTratamiento, diasRetiro);

  return evaluarRetiro({ finTratamiento, finRetiro }, referencia);
}

/** Evalúa un retiro ya registrado contra una fecha. */
export function evaluarRetiro(
  retiro: { finTratamiento: Date; finRetiro: Date },
  referencia: Date = new Date(),
): RetiroCalculado {
  const diasRestantes = Math.ceil((retiro.finRetiro.getTime() - referencia.getTime()) / 86_400_000);

  if (diasRestantes <= 0) {
    return {
      finTratamiento: retiro.finTratamiento,
      finRetiro: retiro.finRetiro,
      diasRestantes: 0,
      puedeVenderse: true,
    };
  }

  return {
    finTratamiento: retiro.finTratamiento,
    finRetiro: retiro.finRetiro,
    diasRestantes,
    puedeVenderse: false,
    motivo: `Retiro de medicamento vigente: faltan ${diasRestantes} día(s) (hasta ${retiro.finRetiro.toISOString().slice(0, 10)})`,
  };
}

function sumarDias(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

/** Estados que exigen retiro vencido: vender o sacrificar un animal tratado. */
export const ESTADOS_QUE_EXIGEN_RETIRO_VENCIDO = ['vendido', 'sacrificado'] as const;
