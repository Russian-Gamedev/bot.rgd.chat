import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { type AuthenticatedActor } from '#core/permissions/permissions.types';

import { CurrentUserProfileDto } from './dto/current-user-profile.dto';
import { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import { PublicUserProfileDto } from './dto/public-user-profile.dto';
import { PublicProfileService } from './public-profile.service';
import { UserService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly publicProfileService: PublicProfileService,
  ) {}

  @Get('me')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Get current user profile and permissions',
    description:
      'Accepts a user JWT from cookie/header or a linked bot bearer token. Unlinked bot tokens are rejected.',
  })
  @ApiOkResponse({ type: CurrentUserProfileDto })
  @ApiBadRequestResponse({
    description: 'Bot token is not linked to a Discord profile.',
  })
  @ApiNotFoundResponse({ description: 'User profile was not found.' })
  async getMe(@Actor() actor: AuthenticatedActor) {
    const userId = getActorUserId(actor);
    return this.publicProfileService.getCurrentUserProfile(userId, actor);
  }

  @Patch('me')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Update current user profile information',
    description:
      'Accepts a user JWT from cookie/header or a linked bot bearer token. Missing fields are preserved; null clears nullable fields.',
  })
  @ApiBody({ type: PatchCurrentUserProfileDto })
  @ApiOkResponse({ type: CurrentUserProfileDto })
  @ApiBadRequestResponse({
    description: 'Bot token is not linked to a Discord profile.',
  })
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
  @ApiOperation({
    summary: 'Get public user profile',
    description: 'Looks up a user profile by Discord ID or username.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discord user ID or username.',
    example: '123456789012345678',
  })
  @ApiOkResponse({ type: PublicUserProfileDto })
  @ApiNotFoundResponse({ description: 'User profile was not found.' })
  async getById(@Param('id') id: string): Promise<PublicUserProfileDto> {
    return this.publicProfileService.getPublicProfile(id);
  }
}
