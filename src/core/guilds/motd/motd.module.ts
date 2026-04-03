import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { MotdEntity } from './entities/motd.entity';
import { MotdService } from './motd.service';

@Module({
  imports: [MikroOrmModule.forFeature([MotdEntity])],
  providers: [MotdService],
  exports: [MotdService],
})
export class MotdModule {}
