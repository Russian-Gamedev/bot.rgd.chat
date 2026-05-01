import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';

import { BotApiGuard, BotScopes } from '#core/bots/bots.guard';
import { BotScope } from '#core/bots/bots.types';

import { CrossPostRouteService } from './core/crosspost-route.service';
import {
  CreateCrossPostRouteDto,
  UpdateCrossPostRouteDto,
} from './dto/crosspost-route.dto';

@ApiTags('Crosspost')
@Controller('crosspost')
export class CrosspostController {
  constructor(private readonly routeService: CrossPostRouteService) {}

  @Get('routes')
  @UseGuards(BotApiGuard)
  @BotScopes(BotScope.ManageCrosspost)
  @ApiOperation({ summary: 'List crosspost routes' })
  listRoutes() {
    return this.routeService.listRoutes();
  }

  @Get('routes/:id')
  @UseGuards(BotApiGuard)
  @BotScopes(BotScope.ManageCrosspost)
  @ApiOperation({ summary: 'Get crosspost route' })
  getRoute(@Param('id') id: string) {
    const isUuid = isUUID(id, '7');
    if (!isUuid) throw new BadRequestException('Invalid route ID');
    return this.routeService.getRoute(id);
  }

  @Post('routes')
  @UseGuards(BotApiGuard)
  @BotScopes(BotScope.ManageCrosspost)
  @ApiOperation({ summary: 'Create crosspost route' })
  createRoute(@Body() dto: CreateCrossPostRouteDto) {
    return this.routeService.createRoute(dto);
  }

  @Patch('routes/:id')
  @UseGuards(BotApiGuard)
  @BotScopes(BotScope.ManageCrosspost)
  @ApiOperation({ summary: 'Update crosspost route' })
  updateRoute(@Param('id') id: string, @Body() dto: UpdateCrossPostRouteDto) {
    return this.routeService.updateRoute(id, dto);
  }

  @Delete('routes/:id')
  @UseGuards(BotApiGuard)
  @BotScopes(BotScope.ManageCrosspost)
  @ApiOperation({ summary: 'Delete crosspost route' })
  async deleteRoute(@Param('id') id: string) {
    await this.routeService.deleteRoute(id);
    return { ok: true };
  }
}
