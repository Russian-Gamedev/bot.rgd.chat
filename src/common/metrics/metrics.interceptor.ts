import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
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
    const request = http.getRequest<NodeRequest>();
    const response = http.getResponse<NodeResponse>();
    const startedAt = performance.now();
    const metricsPath = this.config.get<string>('METRICS_PATH', '/metrics');
    const route = getRouteLabel(request);

    if (route === metricsPath || request.path === metricsPath) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.record(
          request.method ?? 'unknown',
          route,
          response.statusCode,
          startedAt,
        );
      }),
      catchError((error) => {
        this.record(
          request.method ?? 'unknown',
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

function getRouteLabel(request: NodeRequest): string {
  return request.route?.path || request.path || request.url || 'unknown';
}
