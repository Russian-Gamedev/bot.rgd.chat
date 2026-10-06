import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import {
  ProjectAttachmentEntity,
  ProjectAuthorEntity,
  ProjectEntity,
  ProjectLikeEntity,
  ProjectLinkEntity,
  ProjectReviewEventEntity,
  ProjectRevisionEntity,
  ProjectRevisionTagEntity,
  ProjectTagEntity,
} from './entities/projects.entity';
import { ProjectLikesService } from './project-likes.service';
import { ProjectReviewService } from './project-review.service';
import { ProjectTagsService } from './project-tags.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
@Module({
  imports: [
    MikroOrmModule.forFeature([
      ProjectEntity,
      ProjectRevisionEntity,
      ProjectAuthorEntity,
      ProjectTagEntity,
      ProjectRevisionTagEntity,
      ProjectLinkEntity,
      ProjectAttachmentEntity,
      ProjectLikeEntity,
      ProjectReviewEventEntity,
    ]),
    PermissionsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectReviewService,
    ProjectLikesService,
    ProjectTagsService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
