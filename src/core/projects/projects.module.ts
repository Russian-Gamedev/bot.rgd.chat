import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { ProjectUploadEntity } from './entities/project-upload.entity';
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
import { ProjectUploadsService } from './project-uploads.service';
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
      ProjectUploadEntity,
    ]),
    PermissionsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectReviewService,
    ProjectLikesService,
    ProjectTagsService,
    ProjectUploadsService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
