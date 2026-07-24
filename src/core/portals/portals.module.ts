import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { commands } from './commands';
import { PortalEntity } from './entities/portal.entity';
import { PortalBlacklistEntity } from './entities/portal-blacklist.entity';
import { PortalsService } from './portals.service';

@Module({
  imports: [MikroOrmModule.forFeature([PortalEntity, PortalBlacklistEntity])],
  providers: [PortalsService, ...commands],
})
export class PortalsModule {}
