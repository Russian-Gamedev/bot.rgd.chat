import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import {
  Actor,
  RequirePermissions,
} from '#core/permissions/permissions.decorator';
import {
  ActorAuthGuard,
  PermissionGuard,
} from '#core/permissions/permissions.guard';
import { PermissionService } from '#core/permissions/permissions.service';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { Permission } from '#core/permissions/permissions.types';
import {
  CreateGameDto,
  GameDetailsDto,
  GameEditorDto,
  GameLikeStateDto,
  GameListQueryDto,
  GameListResponseDto,
  GamePublicTagDto,
  GameReviewListQueryDto,
  MineGamesQueryDto,
  PublishGameDto,
  RequestGameChangesDto,
  TransferGameOwnerDto,
  UpdateGameDto,
} from './dto/games.dto';
import { GameLikesService } from './game-likes.service';
import { GameReviewService } from './game-review.service';
import { GameTagsService } from './game-tags.service';
import { GamesService } from './games.service';

@ApiTags('Games')
@Controller('games')
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly review: GameReviewService,
    private readonly likes: GameLikesService,
    private readonly tags: GameTagsService,
    private readonly permissions: PermissionService,
  ) {}
  @Get()
  @ApiOperation({ summary: 'List published community games' })
  @ApiOkResponse({ type: GameListResponseDto })
  list(@Query() q: GameListQueryDto) {
    return this.games.list(q);
  }
  @Post()
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOperation({ summary: 'Create a community game draft' })
  @ApiCreatedResponse({ type: GameEditorDto })
  create(@Actor() a: AuthenticatedActor, @Body() d: CreateGameDto) {
    return this.games.create(getActorUserId(a), d);
  }
  @Get('mine') @UseGuards(ActorAuthGuard) @ApiActorAuth() mine(
    @Actor() a: AuthenticatedActor,
    @Query() q: MineGamesQueryDto,
  ) {
    return this.games.listMine(getActorUserId(a), q);
  }
  @Get('review')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GamesReview)
  @ApiActorAuth()
  reviewList(@Query() q: GameReviewListQueryDto) {
    return this.review.list(q);
  }
  @Get('tags')
  @ApiOperation({ summary: 'List all game tags for autocomplete' })
  @ApiOkResponse({ type: [GamePublicTagDto] })
  getTags() {
    return this.tags.list();
  }
  @Get(':id/editor')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  async editor(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.games.getEditor(
      id,
      getActorUserId(a),
      await this.isReviewer(a),
    );
  }
  @Get(':id/review')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GamesReview)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  reviewOne(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.games.getEditor(id, getActorUserId(a), true);
  }
  @Post(':id/review/publish')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GamesReview)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  publish(
    @Param('id') id: string,
    @Actor() a: AuthenticatedActor,
    @Body() d: PublishGameDto,
  ) {
    return this.review.publish(id, getActorUserId(a), d.comment);
  }
  @Post(':id/review/request-changes')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GamesReview)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  changes(
    @Param('id') id: string,
    @Actor() a: AuthenticatedActor,
    @Body() d: RequestGameChangesDto,
  ) {
    return this.review.requestChanges(id, getActorUserId(a), d.comment);
  }
  @Patch(':id/review/owner')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GamesReview)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  owner(@Param('id') id: string, @Body() d: TransferGameOwnerDto) {
    return this.review.transferOwner(id, d.owner_id);
  }
  @Post(':id/submit-review')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  submit(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.games.submit(id, getActorUserId(a));
  }
  @Get(':id/like')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameLikeStateDto })
  getLike(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.likes.get(id, getActorUserId(a));
  }
  @Put(':id/like')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameLikeStateDto })
  like(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.likes.like(id, getActorUserId(a));
  }
  @Delete(':id/like')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameLikeStateDto })
  unlike(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.likes.unlike(id, getActorUserId(a));
  }
  @Get(':id_or_slug')
  @ApiParam({
    name: 'id_or_slug',
    description: 'Game UUID or editable public slug.',
  })
  @ApiOkResponse({ type: GameDetailsDto })
  get(@Param('id_or_slug') idOrSlug: string) {
    return this.games.getPublic(idOrSlug);
  }
  @Patch(':id')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOkResponse({ type: GameEditorDto })
  update(
    @Param('id') id: string,
    @Actor() a: AuthenticatedActor,
    @Body() d: UpdateGameDto,
  ) {
    return this.games.update(id, getActorUserId(a), d);
  }
  @Delete(':id')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.games.remove(id, getActorUserId(a), await this.isReviewer(a));
  }
  private isReviewer(a: AuthenticatedActor) {
    return this.permissions.hasPermission(a, Permission.GamesReview);
  }
}
