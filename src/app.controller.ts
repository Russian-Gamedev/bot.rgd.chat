import * as path from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { HealthResponseDto } from '#common/dto/openapi.dto';

const assets = path.resolve('./assets');
@ApiTags('System')
@Controller()
export class AppController {
  @Get('favicon.ico')
  @ApiOperation({ summary: 'Get application favicon' })
  @ApiOkResponse({ description: 'Returns the static favicon asset.' })
  favicon(@Res() res: Response) {
    return res.sendFile(assets + '/icon.webp');
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ type: HealthResponseDto })
  health() {
    return { status: 'ok' };
  }
}
