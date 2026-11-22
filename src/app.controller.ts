import * as path from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

const assets = path.resolve('./assets');
@Controller()
export class AppController {
  @Get('favicon.ico')
  favicon(@Res() res: NodeResponse) {
    return res.sendFile(assets + '/icon.webp');
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
