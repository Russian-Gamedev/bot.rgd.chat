import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';

import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import {
  ActorType,
  type AuthenticatedActor,
} from '#core/permissions/permissions.types';

import { toPublicUserProfileDto } from './dto/public-user-profile.dto';
import { UserService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(ActorAuthGuard)
  async getMe(@Actor() actor: AuthenticatedActor) {
    if (actor.type === ActorType.Bot && !actor.bot.botUserId) {
      throw new BadRequestException(
        'Bot token is not linked to a Discord profile.',
      );
    }

    const userId =
      actor.type === ActorType.User ? actor.id : actor.bot.botUserId!;
    const profile = await this.userService.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('User profile was not found.');
    }

    return toPublicUserProfileDto(profile);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const profile = await this.userService.getProfile(id);
    if (!profile) {
      throw new NotFoundException('User profile was not found.');
    }

    return toPublicUserProfileDto(profile);
  }
}
