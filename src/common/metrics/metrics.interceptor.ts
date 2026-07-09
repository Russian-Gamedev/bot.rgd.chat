import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';

import { EnvironmentVariables } from '#config/env';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsHttpInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables>,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    const metricsPath = this.config.get<string>('METRICS_PATH', '/metrics');
    const route = getRouteLabel(request);

    if (route === metricsPath || request.path === metricsPath) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.record(request.method, route, response.statusCode, startedAt);
      }),
      catchError((error) => {
        this.record(
          request.method,
          route,
          typeof error?.status === 'number' ? error.status : 500,
          startedAt,
        );
        return throwError(() => error);
      }),
    );
  }

  private record(
    method: string,
    route: string,
    status: number,
    startedAt: number,
  ) {
    this.metrics.recordHttpRequest({
      method,
      route,
      status,
      durationSeconds: (performance.now() - startedAt) / 1000,
    });
  }
}

function getRouteLabel(request: Request): string {
  const routePath = request.route?.path;
  if (typeof routePath === 'string') return routePath;
  if (Array.isArray(routePath)) return routePath.join('|');
  return request.path || request.url || 'unknown';
}
