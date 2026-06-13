import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  Actor,
  RequireActorTypes,
} from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { ActorType } from '#core/permissions/permissions.types';
import { BotsService } from './bots.service';

@Controller('bots')
@UseGuards(PermissionGuard)
@RequireActorTypes(ActorType.Bot)
@UseInterceptors(ClassSerializerInterceptor)
export class BotsController {
  constructor(readonly _botsService: BotsService) {}

  @Get('me')
  getMe(@Actor() actor: AuthenticatedActor) {
    return actor.type === ActorType.Bot ? actor.bot : actor;
  }
}
