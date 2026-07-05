import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiBotAuth } from '#core/permissions/openapi-auth.decorator';
import {
  Actor,
  RequireActorTypes,
} from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { ActorType } from '#core/permissions/permissions.types';
import { BotsService } from './bots.service';
import { BotDto } from './dto/bot.dto';

@ApiTags('Bots')
@Controller('bots')
@UseGuards(PermissionGuard)
@RequireActorTypes(ActorType.Bot)
@UseInterceptors(ClassSerializerInterceptor)
@ApiBotAuth()
export class BotsController {
  constructor(readonly _botsService: BotsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current bot profile' })
  @ApiOkResponse({ type: BotDto })
  getMe(@Actor() actor: AuthenticatedActor) {
    return actor.type === ActorType.Bot ? actor.bot : actor;
  }
}
