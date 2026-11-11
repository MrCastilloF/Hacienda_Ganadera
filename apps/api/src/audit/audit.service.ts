import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { currentContext, markAudited } from '../common/request-context';

export type AuditResultado = 'OK' | 'ERROR' | 'DENEGADO';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  before?: unknown;
  after?: unknown;
  resultado?: AuditResultado;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditRow {
  id: string;
  occurredAt: Date;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  resultado: AuditResultado;
  ip: string | null;
  requestId: string;
  hash: string;
  prevHash: string | null;
}

export interface AuditVerificationRow {
  id: string;
  occurredAt: Date;
  motivo: string;
}

export interface AuditFilters {
  limit: number;
  offset: number;
  entity?: string;
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

/**
 * Auditoría encadenada (ADR-0004).
 *
 * Toda escritura pasa por `app.audit_append`, que serializa la cadena con un
 * lock de asesoramiento y calcula el hash SHA-256 dentro de la transacción.
 * Cuando se pasa `tx`, la auditoría se confirma o revierte junto con el cambio
 * de negocio: no puede quedar un cambio sin su registro.
 *
 * La tabla está particionada por año y no tiene un `@id` simple, por eso se
 * consulta con SQL tipado y no con el cliente de Prisma.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<string | null> {
    const ctx = currentContext();
    const requestId = entry.requestId ?? ctx?.requestId ?? randomUUID();
    const client = tx ?? this.prisma;

    try {
      const rows = await client.$queryRaw<Array<{ hash: string }>>`
        SELECT (app.audit_append(
          ${entry.actorId ?? null}::uuid,
          ${entry.action},
          ${entry.entity},
          ${entry.entityId ?? null},
          ${entry.before === undefined ? null : JSON.stringify(entry.before)}::jsonb,
          ${entry.after === undefined ? null : JSON.stringify(entry.after)}::jsonb,
          ${entry.resultado ?? 'OK'},
          ${entry.ip ?? ctx?.ip ?? null}::text,
          ${entry.userAgent ?? ctx?.userAgent ?? null},
          ${requestId}::uuid
        )).hash AS hash
      `;
      markAudited();
      return rows[0]?.hash ?? null;
    } catch (error) {
      // Una auditoría que falla es un incidente, no un detalle: se registra y se
      // propaga para que la transacción de negocio no se confirme sin su registro.
      this.logger.error(
        {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          requestId,
          error: error instanceof Error ? error.message : String(error),
        },
        'No se pudo registrar la auditoría: se aborta la operación',
      );
      throw error;
    }
  }

  async list(filters: AuditFilters): Promise<{ total: number; items: AuditRow[] }> {
    const conditions: Prisma.Sql[] = [];

    if (filters.entity) conditions.push(Prisma.sql`entity = ${filters.entity}`);
    if (filters.action) conditions.push(Prisma.sql`action = ${filters.action}`);
    if (filters.actorId) conditions.push(Prisma.sql`actor_id = ${filters.actorId}::uuid`);
    if (filters.from) conditions.push(Prisma.sql`occurred_at >= ${filters.from}`);
    if (filters.to) conditions.push(Prisma.sql`occurred_at <= ${filters.to}`);

    const where =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: bigint;
        occurred_at: Date;
        actor_id: string | null;
        action: string;
        entity: string;
        entity_id: string | null;
        resultado: string;
        ip: string | null;
        request_id: string;
        hash: string;
        prev_hash: string | null;
      }>
    >`
      SELECT id, occurred_at, actor_id, action, entity, entity_id, resultado, ip, request_id, hash, prev_hash
      FROM app.audit_log
      ${where}
      ORDER BY id DESC
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    `;

    const countRows = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM app.audit_log ${where}
    `;

    return {
      total: Number(countRows[0]?.total ?? 0),
      items: rows.map((row) => ({
        id: row.id.toString(),
        occurredAt: row.occurred_at,
        actorId: row.actor_id,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        resultado: row.resultado as AuditResultado,
        ip: row.ip,
        requestId: row.request_id,
        hash: row.hash,
        prevHash: row.prev_hash,
      })),
    };
  }

  /** Devuelve las rupturas de la cadena en el rango. Sin filas = cadena íntegra. */
  async verify(from?: Date, to?: Date): Promise<AuditVerificationRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: bigint; occurred_at: Date; motivo: string }>
    >`SELECT * FROM app.audit_verify(${from ?? null}::timestamptz, ${to ?? null}::timestamptz)`;

    return rows.map((r) => ({ id: r.id.toString(), occurredAt: r.occurred_at, motivo: r.motivo }));
  }

  async stats(): Promise<{ total: number; ultimo: Date | null }> {
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint; ultimo: Date | null }>>`
      SELECT count(*) AS total, max(occurred_at) AS ultimo FROM app.audit_log
    `;
    const row = rows[0];
    return { total: Number(row?.total ?? 0), ultimo: row?.ultimo ?? null };
  }
}
