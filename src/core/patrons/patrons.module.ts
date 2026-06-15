import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { RedisModule } from '#common/redis.module';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { UserModule } from '#core/users/users.module';
import { PatronEntity } from './entities/patron.entity';
import { PatronHistoryEntity } from './entities/patron-history.entity';
import { PatronsController } from './patrons.controller';
import { PatronsService } from './patrons.service';

@Module({
  imports: [
    RedisModule,
    UserModule,
    MikroOrmModule.forFeature([
      PatronEntity,
      PatronHistoryEntity,
      UserProfileEntity,
    ]),
  ],
  controllers: [PatronsController],
  providers: [PatronsService],
  exports: [PatronsService],
})
export class PatronsModule {}
