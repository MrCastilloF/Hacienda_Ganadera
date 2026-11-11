import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { PasswordService } from '../auth/password.service';
import { AppError } from '../common/app-error';

export const CrearUsuarioSchema = z.object({
  email: z.string().email(),
  nombre: z.string().min(2).max(120),
  cargo: z.string().max(120).optional(),
  password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres').max(200),
  roles: z.array(z.string().min(2).max(40)).min(1, 'Debe asignar al menos un rol'),
  fincaId: z.string().uuid().optional(),
});

export const ActualizarUsuarioSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  cargo: z.string().max(120).nullable().optional(),
  activo: z.boolean().optional(),
});

export const AsignarRolesSchema = z.object({
  roles: z.array(z.string().min(2).max(40)).min(1),
});

export const ResetPasswordSchema = z.object({
  nueva: z.string().min(12).max(200),
});

export type CrearUsuarioInput = z.infer<typeof CrearUsuarioSchema>;

@Injectable()
export class UsuariosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RbacService) private readonly rbac: RbacService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  async list(params: { limit: number; offset: number; q?: string; activo?: boolean }) {
    const where = {
      deletedAt: null,
      ...(params.activo === undefined ? {} : { activo: params.activo }),
      ...(params.q
        ? {
            OR: [
              { nombre: { contains: params.q, mode: 'insensitive' as const } },
              { email: { contains: params.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: params.offset,
        take: params.limit,
        select: {
          id: true,
          email: true,
          nombre: true,
          cargo: true,
          activo: true,
          mfaHabilitado: true,
          ultimoAccesoAt: true,
          bloqueadoHasta: true,
          createdAt: true,
          roles: { select: { rol: { select: { codigo: true } } } },
          fincas: { select: { fincaId: true } },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        cargo: u.cargo,
        activo: u.activo,
        mfaHabilitado: u.mfaHabilitado,
        ultimoAccesoAt: u.ultimoAccesoAt,
        bloqueado: Boolean(u.bloqueadoHasta && u.bloqueadoHasta.getTime() > Date.now()),
        createdAt: u.createdAt,
        roles: u.roles.map((r) => r.rol.codigo),
        fincas: u.fincas.map((f) => f.fincaId),
      })),
    };
  }

  async getById(id: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        nombre: true,
        cargo: true,
        activo: true,
        mfaHabilitado: true,
        ultimoAccesoAt: true,
        createdAt: true,
        roles: { select: { rol: { select: { codigo: true, nombre: true } } } },
        fincas: { select: { finca: { select: { id: true, codigo: true, nombre: true } } } },
      },
    });

    if (!usuario) throw AppError.notFound('Usuario no encontrado');

    return {
      ...usuario,
      roles: usuario.roles.map((r) => r.rol),
      fincas: usuario.fincas.map((f) => f.finca),
    };
  }

  async crear(input: CrearUsuarioInput, actorId: string) {
    const email = input.email.trim().toLowerCase();

    const existente = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, deletedAt: true },
    });
    if (existente) {
      throw AppError.conflict(
        existente.deletedAt
          ? 'Ya existe un usuario con ese correo (anulado). Restablézcalo en lugar de duplicarlo.'
          : 'Ya existe un usuario con ese correo',
      );
    }

    const roles = await this.prisma.rol.findMany({
      where: { codigo: { in: input.roles } },
      select: { id: true, codigo: true },
    });
    const faltantes = input.roles.filter((r) => !roles.some((x) => x.codigo === r));
    if (faltantes.length > 0) {
      throw AppError.validation('Roles inexistentes', { roles: faltantes });
    }

    const passwordHash = await this.passwords.hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email,
          nombre: input.nombre,
          cargo: input.cargo ?? null,
          passwordHash,
          createdBy: actorId,
          roles: { create: roles.map((r) => ({ rolId: r.id })) },
          ...(input.fincaId
            ? { fincas: { create: [{ fincaId: input.fincaId, esPredeterminada: true }] } }
            : {}),
        },
        select: { id: true, email: true, nombre: true, activo: true, createdAt: true },
      });

      await this.audit.record(
        {
          action: 'usuarios.crear',
          entity: 'usuario',
          entityId: usuario.id,
          actorId,
          after: { email: usuario.email, nombre: usuario.nombre, roles: input.roles },
        },
        tx,
      );

      return usuario;
    });
  }

  async actualizar(
    id: string,
    input: { nombre?: string; cargo?: string | null; activo?: boolean },
    actorId: string,
  ) {
    const actual = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, nombre: true, cargo: true, activo: true },
    });
    if (!actual) throw AppError.notFound('Usuario no encontrado');

    if (id === actorId && input.activo === false) {
      throw AppError.validation('Un usuario no puede desactivarse a sí mismo');
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { id },
        data: {
          ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
          ...(input.cargo !== undefined ? { cargo: input.cargo } : {}),
          ...(input.activo !== undefined ? { activo: input.activo } : {}),
          updatedBy: actorId,
        },
        select: { id: true, email: true, nombre: true, cargo: true, activo: true },
      });

      if (input.activo !== undefined) {
        this.rbac.invalidate(id);
      }

      await this.audit.record(
        {
          action: 'usuarios.modificar',
          entity: 'usuario',
          entityId: id,
          actorId,
          before: actual,
          after: actualizado,
        },
        tx,
      );

      return actualizado;
    });
  }

  async asignarRoles(id: string, codigos: string[], actorId: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, roles: { select: { rol: { select: { codigo: true } } } } },
    });
    if (!usuario) throw AppError.notFound('Usuario no encontrado');

    const roles = await this.prisma.rol.findMany({
      where: { codigo: { in: codigos } },
      select: { id: true, codigo: true },
    });
    const faltantes = codigos.filter((c) => !roles.some((r) => r.codigo === c));
    if (faltantes.length > 0) throw AppError.validation('Roles inexistentes', { roles: faltantes });

    if (id === actorId && !codigos.includes('superadmin') && usuario.roles.some((r) => r.rol.codigo === 'superadmin')) {
      throw AppError.validation(
        'No puede quitarse el rol de superadministrador a sí mismo: otro superadministrador debe hacerlo',
      );
    }

    const antes = usuario.roles.map((r) => r.rol.codigo).sort();

    return this.prisma.$transaction(async (tx) => {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioRol.createMany({
        data: roles.map((r) => ({ usuarioId: id, rolId: r.id, createdBy: actorId })),
      });

      this.rbac.invalidate(id);

      await this.audit.record(
        {
          action: 'usuarios.roles',
          entity: 'usuario',
          entityId: id,
          actorId,
          before: { roles: antes },
          after: { roles: codigos.slice().sort() },
        },
        tx,
      );

      return { id, roles: codigos.slice().sort() };
    });
  }

  async resetPassword(id: string, nueva: string, actorId: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!usuario) throw AppError.notFound('Usuario no encontrado');

    const passwordHash = await this.passwords.hash(nueva);

    const revocadas = await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: { passwordHash, passwordCambiadaAt: new Date(), intentosFallidos: 0, bloqueadoHasta: null },
      });
      const result = await tx.sesion.updateMany({
        where: { usuarioId: id, revocadaAt: null },
        data: { revocadaAt: new Date(), motivoRevocacion: 'reset_administrativo' },
      });
      await this.audit.record(
        {
          action: 'usuarios.reset_password',
          entity: 'usuario',
          entityId: id,
          actorId,
          after: { sesionesRevocadas: result.count },
        },
        tx,
      );
      return result.count;
    });

    return { actualizada: true, sesionesRevocadas: revocadas };
  }
}
