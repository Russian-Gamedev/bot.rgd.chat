import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { type AuthenticatedActor } from '#core/permissions/permissions.types';
import { replaceImageExtension } from '#lib/utils/discord';

import { CurrentUserProfileDto } from './dto/current-user-profile.dto';
import { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import { PublicProfileService } from './public-profile.service';
import { UserService } from './users.service';

const AVATAR_EXTENSIONS = new Set(['png', 'webp', 'gif']);

@Controller('users')
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly publicProfileService: PublicProfileService,
  ) {}

  @Get('me')
  @UseGuards(ActorAuthGuard)
  async getMe(@Actor() actor: AuthenticatedActor) {
    const userId = getActorUserId(actor);
    return this.publicProfileService.getCurrentUserProfile(userId, actor);
  }

  @Patch('me')
  @UseGuards(ActorAuthGuard)
  async patchMe(
    @Actor() actor: AuthenticatedActor,
    @Body() dto: PatchCurrentUserProfileDto,
  ): Promise<CurrentUserProfileDto> {
    const userId = getActorUserId(actor);
    const profile = await this.userService.updateProfileInfo(userId, dto);
    await this.publicProfileService.invalidateProfileCache(profile);
    return this.publicProfileService.getCurrentUserProfile(userId, actor);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Res() res: Response) {
    const ext = id.split('.').at(-1);
    if (ext && AVATAR_EXTENSIONS.has(ext)) {
      const lookup = id.slice(0, id.length - ext.length - 1);
      const profile = await this.publicProfileService.getPublicProfile(lookup);
      return res.redirect(308, replaceImageExtension(profile.avatarUrl, ext));
    }

    const profile = await this.publicProfileService.getPublicProfile(id);
    return res.json(profile);
  }
}
