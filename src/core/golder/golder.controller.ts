import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { getActorUserId } from '#core/permissions/actor-user-id';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { CreateGolderUploadDto } from './dto/create-golder-upload.dto';
import {
  type GolderImportResultDto,
  type GolderMediaDto,
  type GolderMediaListDto,
  type GolderUploadDto,
} from './dto/golder-media.dto';
import { ImportGolderDto } from './dto/import-golder.dto';
import { ListGolderQueryDto } from './dto/list-golder-query.dto';
import { UpdateGolderMediaDto } from './dto/update-golder-media.dto';
import { GolderService } from './golder.service';
import type { GolderSourceInfo } from './source-resolver';

@Controller('golder')
export class GolderController {
  constructor(private readonly golderService: GolderService) {}

  @Post('uploads')
  @UseGuards(ActorAuthGuard)
  createUpload(
    @Actor() actor: AuthenticatedActor,
    @Body() dto: CreateGolderUploadDto,
  ): Promise<GolderUploadDto> {
    return this.golderService.createUpload(getActorUserId(actor), dto);
  }

  @Post('import')
  @UseGuards(ActorAuthGuard)
  async importFromDiscord(
    @Actor() actor: AuthenticatedActor,
    @Body() dto: ImportGolderDto,
  ): Promise<GolderImportResultDto> {
    const items = await this.golderService.importFromUrl(
      getActorUserId(actor),
      dto.url,
      dto.name,
      dto.tags,
    );
    return { items };
  }

  @Get('import/resolve')
  @UseGuards(ActorAuthGuard)
  resolveSource(
    @Actor() actor: AuthenticatedActor,
    @Query('url') url: string,
  ): Promise<GolderSourceInfo> {
    return this.golderService.resolveSource(getActorUserId(actor), url);
  }

  @Post('uploads/:id/complete')
  @UseGuards(ActorAuthGuard)
  async completeUpload(
    @Actor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ): Promise<GolderMediaDto> {
    assertUuid(id);
    return this.golderService.completeUpload(getActorUserId(actor), id);
  }

  @Get()
  listMedia(@Query() query: ListGolderQueryDto): Promise<GolderMediaListDto> {
    return this.golderService.listMedia(query);
  }

  @Get('tags')
  suggestTags(@Query('q') q = ''): Promise<string[]> {
    return this.golderService.suggestTags(q.trim());
  }

  @Get(':slug')
  getMedia(@Param('slug') slug: string): Promise<GolderMediaDto> {
    return this.golderService.getMedia(slug);
  }

  @Patch(':slug')
  @UseGuards(ActorAuthGuard)
  updateMedia(
    @Actor() actor: AuthenticatedActor,
    @Param('slug') slug: string,
    @Body() dto: UpdateGolderMediaDto,
  ): Promise<GolderMediaDto> {
    return this.golderService.updateMedia(getActorUserId(actor), slug, dto);
  }

  @Delete(':slug')
  @UseGuards(ActorAuthGuard)
  deleteMedia(
    @Actor() actor: AuthenticatedActor,
    @Param('slug') slug: string,
  ): Promise<void> {
    return this.golderService.deleteMedia(getActorUserId(actor), slug);
  }
}

function assertUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new NotFoundException('Golder media was not found.');
  }
}
