import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type Scope = 'global' | 'finca' | 'lote' | 'propio';

const SCOPE_ORDER: Record<Scope, number> = { global: 4, finca: 3, lote: 2, propio: 1 };

export interface PermissionEntry {
  codigo: string;
  modulo: string;
  operacion: string;
  alcance: Scope;
}

export interface UserContext {
  userId: string;
  email: string;
  nombre: string;
  roles: string[];
  fincas: string[];
  scope: Scope;
  permissions: Map<string, Scope>;
}

interface CacheEntry {
  expiresAt: number;
  context: UserContext;
}

/**
 * Resolución de permisos (RF-USU-03).
 *
 * Los permisos se leen de la base (rol → permiso → alcance) y se cachean 60 s.
 * La caché se invalida explícitamente cuando un administrador cambia roles,
 * para que el cambio surta efecto en la siguiente petición del usuario.
 */
@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getContext(userId: string): Promise<UserContext | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.context;

    const usuario = await this.prisma.usuario.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        nombre: true,
        activo: true,
        roles: { select: { rol: { select: { codigo: true } } } },
        fincas: { select: { fincaId: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      this.cache.delete(userId);
      return null;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ codigo: string; modulo: string; operacion: string; alcance: string }>
    >`
      SELECT p.codigo, p.modulo, p.operacion, rp.alcance
      FROM app.usuario_rol ur
      JOIN app.rol_permiso rp ON rp.rol_id = ur.rol_id
      JOIN app.permiso p ON p.id = rp.permiso_id
      WHERE ur.usuario_id = ${userId}::uuid
    `;

    const permissions = new Map<string, Scope>();
    let scope: Scope = 'propio';

    for (const row of rows) {
      const alcance = row.alcance as Scope;
      const previous = permissions.get(row.codigo);
      if (!previous || SCOPE_ORDER[alcance] > SCOPE_ORDER[previous]) {
        permissions.set(row.codigo, alcance);
      }
      if (SCOPE_ORDER[alcance] > SCOPE_ORDER[scope]) scope = alcance;
    }

    const context: UserContext = {
      userId: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      roles: usuario.roles.map((r) => r.rol.codigo),
      fincas: usuario.fincas.map((f) => f.fincaId),
      scope,
      permissions,
    };

    this.cache.set(userId, { expiresAt: Date.now() + this.ttlMs, context });
    return context;
  }

  async can(userId: string, modulo: string, operacion: string): Promise<boolean> {
    const context = await this.getContext(userId);
    if (!context) return false;
    return context.permissions.has(`${modulo}:${operacion}`);
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
    this.logger.debug({ userId }, 'Caché de permisos invalidada');
  }

  clear(): void {
    this.cache.clear();
  }
}
