import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { PermissionsModule } from '#core/permissions/permissions.module';
import { UserModule } from '#core/users/users.module';

import { ImportToGolderCommand } from './commands/import-to-golder.command';
import { GolderMediaEntity } from './entities/golder-media.entity';
import { GolderController } from './golder.controller';
import { GolderService } from './golder.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([GolderMediaEntity]),
    PermissionsModule,
    UserModule,
  ],
  controllers: [GolderController],
  providers: [GolderService, ImportToGolderCommand],
  exports: [GolderService],
})
export class GolderModule {}
