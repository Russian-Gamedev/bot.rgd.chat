import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { UtilsModule } from '#core/utils/utils.module';

import { commands } from './commands';
import { DeletePortalAutocompleteInterceptor } from './commands/delete-portal.autocomplete';
import { PortalEntity } from './entities/portal.entity';
import { PortalBlacklistEntity } from './entities/portal-blacklist.entity';
import { PortalsService } from './portals.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([PortalEntity, PortalBlacklistEntity]),
    UtilsModule,
  ],
  providers: [PortalsService, DeletePortalAutocompleteInterceptor, ...commands],
})
export class PortalsModule {}
