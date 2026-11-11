import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ActualizarUsuarioSchema,
  AsignarRolesSchema,
  CrearUsuarioSchema,
  ResetPasswordSchema,
  UsuariosService,
} from './usuarios.service';
import { parseBody, parseQuery } from '../common/validation';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().min(1).max(120).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(@Inject(UsuariosService) private readonly usuarios: UsuariosService) {}

  @Get()
  @Require('usuarios', 'consultar')
  @ApiOperation({ summary: 'Lista usuarios con sus roles y fincas' })
  async list(@Query() query: Record<string, unknown>) {
    return this.usuarios.list(parseQuery(ListQuery, query));
  }

  @Get(':id')
  @Require('usuarios', 'consultar')
  @ApiOperation({ summary: 'Detalle de un usuario' })
  async get(@Param() params: Record<string, string>) {
    return this.usuarios.getById(z.object({ id: z.string().uuid() }).parse(params).id);
  }

  @Post()
  @Require('usuarios', 'crear')
  @ApiOperation({ summary: 'Crea un usuario y le asigna roles' })
  async crear(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    return this.usuarios.crear(parseBody(CrearUsuarioSchema, body), user.sub);
  }

  @Patch(':id')
  @Require('usuarios', 'modificar')
  @ApiOperation({ summary: 'Actualiza nombre, cargo o estado del usuario' })
  async actualizar(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    return this.usuarios.actualizar(id, parseBody(ActualizarUsuarioSchema, body), user.sub);
  }

  @Put(':id/roles')
  @Require('usuarios', 'modificar')
  @ApiOperation({ summary: 'Reemplaza los roles del usuario e invalida su caché de permisos' })
  async roles(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const { roles } = parseBody(AsignarRolesSchema, body);
    return this.usuarios.asignarRoles(id, roles, user.sub);
  }

  @Post(':id/reset-password')
  @Require('usuarios', 'modificar')
  @ApiOperation({ summary: 'Restablece la contraseña y revoca las sesiones del usuario' })
  async resetPassword(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const { nueva } = parseBody(ResetPasswordSchema, body);
    return this.usuarios.resetPassword(id, nueva, user.sub);
  }
}
