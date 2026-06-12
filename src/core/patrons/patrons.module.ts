import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { UserEntity } from '#core/users/entities/user.entity';
import { PatronEntity } from './entities/patron.entity';
import { PatronHistoryEntity } from './entities/patron-history.entity';
import { PatronsController } from './patrons.controller';
import { PatronsService } from './patrons.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([PatronEntity, PatronHistoryEntity, UserEntity]),
  ],
  controllers: [PatronsController],
  providers: [PatronsService],
  exports: [PatronsService],
})
export class PatronsModule {}
