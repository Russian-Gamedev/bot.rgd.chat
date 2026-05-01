import { Controller, Get, Res } from '@nestjs/common';
import { type Response } from 'express';
import * as path from 'path';

const assets = path.resolve('../assets');
@Controller()
export class AppController {
  @Get('favicon.ico')
  favicon(@Res() res: Response) {
    return res.sendFile(assets + './icon.webp');
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
