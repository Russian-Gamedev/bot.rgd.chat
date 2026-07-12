import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import {
  GameAttachmentEntity,
  GameAuthorEntity,
  GameEntity,
  GameLikeEntity,
  GameLinkEntity,
  GameReviewEventEntity,
  GameRevisionEntity,
  GameRevisionTagEntity,
  GameTagEntity,
} from './entities/games.entity';
import { GameLikesService } from './game-likes.service';
import { GameReviewService } from './game-review.service';
import { GameTagsService } from './game-tags.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
@Module({
  imports: [
    MikroOrmModule.forFeature([
      GameEntity,
      GameRevisionEntity,
      GameAuthorEntity,
      GameTagEntity,
      GameRevisionTagEntity,
      GameLinkEntity,
      GameAttachmentEntity,
      GameLikeEntity,
      GameReviewEventEntity,
    ]),
    PermissionsModule,
  ],
  controllers: [GamesController],
  providers: [
    GamesService,
    GameReviewService,
    GameLikesService,
    GameTagsService,
  ],
  exports: [GamesService],
})
export class GamesModule {}
