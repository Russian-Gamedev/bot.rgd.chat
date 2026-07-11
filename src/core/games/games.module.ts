import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import {
  GameAttachmentEntity,
  GameAuthorEntity,
  GameEntity,
  GameGenreEntity,
  GameLikeEntity,
  GameLinkEntity,
  GameReviewEventEntity,
  GameRevisionEntity,
  GameRevisionGenreEntity,
} from './entities/games.entity';
import { GameGenresService } from './game-genres.service';
import { GameLikesService } from './game-likes.service';
import { GameReviewService } from './game-review.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
@Module({
  imports: [
    MikroOrmModule.forFeature([
      GameEntity,
      GameRevisionEntity,
      GameAuthorEntity,
      GameGenreEntity,
      GameRevisionGenreEntity,
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
    GameGenresService,
  ],
})
export class GamesModule {}
