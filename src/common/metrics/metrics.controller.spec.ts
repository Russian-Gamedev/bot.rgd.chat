import { describe, expect, it, mock } from 'bun:test';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { Environment, type EnvironmentVariables } from '#config/env';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

function createConfig(values: Partial<EnvironmentVariables>) {
  return {
    get: mock((key: keyof EnvironmentVariables, defaultValue?: unknown) => {
      return key in values ? values[key] : defaultValue;
    }),
  } as unknown as ConfigService<EnvironmentVariables>;
}

function createResponse() {
  const response = {
    headers: new Map<string, string>(),
    body: '',
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    send(body: string) {
      this.body = body;
      return this;
    },
  };

  return response as unknown as Response & {
    headers: Map<string, string>;
    body: string;
  };
}

describe('MetricsController', () => {
  it('returns not found when metrics are disabled', async () => {
    const controller = new MetricsController(
      createConfig({ METRICS_ENABLED: false }),
      new MetricsService(),
    );

    await expect(
      controller.getMetrics(
        { header: mock(() => undefined) } as never,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing production token', async () => {
    const controller = new MetricsController(
      createConfig({
        METRICS_ENABLED: true,
        NODE_ENV: Environment.Production,
        METRICS_TOKEN: 'secret',
      }),
      new MetricsService(),
    );

    await expect(
      controller.getMetrics(
        { header: mock(() => undefined) } as unknown as Request,
        {} as Response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns Prometheus metrics with a valid token', async () => {
    const metrics = new MetricsService();
    const controller = new MetricsController(
      createConfig({
        METRICS_ENABLED: true,
        NODE_ENV: Environment.Production,
        METRICS_TOKEN: 'secret',
      }),
      metrics,
    );
    const response = createResponse();

    await controller.getMetrics(
      { header: mock(() => 'Bearer secret') } as unknown as Request,
      response,
    );

    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(response.body).toContain('rgd_bot_process_cpu_user_seconds_total');
  });
});
