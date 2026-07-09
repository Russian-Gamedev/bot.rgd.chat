import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Environment, EnvironmentVariables } from '#config/env';
import { MetricsService } from './metrics.service';

const METRICS_ROUTE = (process.env.METRICS_PATH ?? '/metrics').replace(
  /^\/+/,
  '',
);

@Controller()
export class MetricsController {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables>,
    private readonly metrics: MetricsService,
  ) {}

  @Get(METRICS_ROUTE)
  @ApiExcludeEndpoint()
  async getMetrics(@Req() request: Request, @Res() response: Response) {
    if (!this.config.get<boolean>('METRICS_ENABLED', true)) {
      throw new NotFoundException();
    }

    const token = this.config.get<string>('METRICS_TOKEN');
    if (token) {
      const header = request.header('authorization') ?? '';
      if (header !== `Bearer ${token}`) {
        throw new UnauthorizedException();
      }
    } else if (
      this.config.get<Environment>('NODE_ENV') === Environment.Production
    ) {
      throw new UnauthorizedException();
    }

    response.setHeader('Content-Type', this.metrics.contentType);
    return response.send(await this.metrics.getMetrics());
  }
}
