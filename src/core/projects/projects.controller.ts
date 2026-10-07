import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { getActorUserId } from '#core/permissions/actor-user-id';
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
import { isUuid } from '#lib/utils';
import {
  CreateProjectDto,
  CreateProjectUploadDto,
  MineProjectsQueryDto,
  ProjectListQueryDto,
  ProjectReviewListQueryDto,
  PublishProjectDto,
  RequestProjectChangesDto,
  TransferProjectOwnerDto,
  UpdateProjectDto,
} from './dto/projects.dto';
import { ProjectLikesService } from './project-likes.service';
import { ProjectReviewService } from './project-review.service';
import { ProjectTagsService } from './project-tags.service';
import { ProjectUploadsService } from './project-uploads.service';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly review: ProjectReviewService,
    private readonly likes: ProjectLikesService,
    private readonly tags: ProjectTagsService,
    private readonly uploads: ProjectUploadsService,
    private readonly permissions: PermissionService,
  ) {}
  @Get()
  list(@Query() q: ProjectListQueryDto) {
    return this.projects.list(q);
  }
  @Post()
  @UseGuards(ActorAuthGuard)
  create(@Actor() a: AuthenticatedActor, @Body() d: CreateProjectDto) {
    return this.projects.create(getActorUserId(a), d);
  }
  @Post('uploads')
  @UseGuards(ActorAuthGuard)
  createUpload(
    @Actor() a: AuthenticatedActor,
    @Body() d: CreateProjectUploadDto,
  ) {
    return this.uploads.create(getActorUserId(a), d);
  }
  @Post('uploads/:id/complete')
  @UseGuards(ActorAuthGuard)
  completeUpload(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    assertUploadId(id);
    return this.uploads.complete(getActorUserId(a), id);
  }
  @Delete('uploads/:id')
  @UseGuards(ActorAuthGuard)
  @HttpCode(204)
  deleteUpload(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    assertUploadId(id);
    return this.uploads.remove(getActorUserId(a), id);
  }
  @Get('mine')
  @UseGuards(ActorAuthGuard)
  mine(@Actor() a: AuthenticatedActor, @Query() q: MineProjectsQueryDto) {
    return this.projects.listMine(getActorUserId(a), q);
  }
  @Get('review')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.ProjectsReview)
  reviewList(@Query() q: ProjectReviewListQueryDto) {
    return this.review.list(q);
  }
  @Get('tags')
  getTags() {
    return this.tags.list();
  }
  @Get(':id/editor')
  @UseGuards(ActorAuthGuard)
  async editor(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.projects.getEditor(
      id,
      getActorUserId(a),
      await this.isReviewer(a),
    );
  }
  @Get(':id/review')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.ProjectsReview)
  reviewOne(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.projects.getEditor(id, getActorUserId(a), true);
  }
  @Post(':id/review/publish')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.ProjectsReview)
  publish(
    @Param('id') id: string,
    @Actor() a: AuthenticatedActor,
    @Body() d: PublishProjectDto,
  ) {
    return this.review.publish(id, getActorUserId(a), d.comment);
  }
  @Post(':id/review/request-changes')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.ProjectsReview)
  changes(
    @Param('id') id: string,
    @Actor() a: AuthenticatedActor,
    @Body() d: RequestProjectChangesDto,
  ) {
    return this.review.requestChanges(id, getActorUserId(a), d.comment);
  }
  @Patch(':id/review/owner')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.ProjectsReview)
  owner(@Param('id') id: string, @Body() d: TransferProjectOwnerDto) {
    return this.review.transferOwner(id, d.owner_id);
  }
  @Post(':id/submit-review')
  @UseGuards(ActorAuthGuard)
  submit(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.projects.submit(id, getActorUserId(a));
  }
  @Get(':id/like')
  @UseGuards(ActorAuthGuard)
  getLike(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.likes.get(id, getActorUserId(a));
  }
  @Put(':id/like')
  @UseGuards(ActorAuthGuard)
  like(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.likes.like(id, getActorUserId(a));
  }
  @Delete(':id/like')
  @UseGuards(ActorAuthGuard)
  unlike(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.likes.unlike(id, getActorUserId(a));
  }
  @Get(':id_or_slug')
  get(@Param('id_or_slug') idOrSlug: string) {
    return this.projects.getPublic(idOrSlug);
  }
  @Patch(':id')
  @UseGuards(ActorAuthGuard)
  update(
    @Param('id') id: string,
    @Actor() a: AuthenticatedActor,
    @Body() d: UpdateProjectDto,
  ) {
    return this.projects.update(id, getActorUserId(a), d);
  }
  @Delete(':id')
  @UseGuards(ActorAuthGuard)
  @HttpCode(204)
  async remove(@Param('id') id: string, @Actor() a: AuthenticatedActor) {
    return this.projects.remove(
      id,
      getActorUserId(a),
      await this.isReviewer(a),
    );
  }
  private isReviewer(a: AuthenticatedActor) {
    return this.permissions.hasPermission(a, Permission.ProjectsReview);
  }
}

function assertUploadId(id: string): void {
  if (!isUuid(id)) {
    throw new NotFoundException('Project upload was not found.');
  }
}
