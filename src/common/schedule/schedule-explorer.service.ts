import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import {
  SCHEDULE_CRON_METADATA,
  SCHEDULE_INTERVAL_METADATA,
  SCHEDULE_TIMEOUT_METADATA,
} from './schedule.constants';
import type {
  CronMetadata,
  IntervalMetadata,
  TimeoutMetadata,
} from './schedule.decorators';
import { normalizeCronExpression } from './schedule.utils';
import { SchedulerRegistry } from './scheduler-registry.service';

type InstanceTarget = Parameters<Reflector['get']>[1];

@Injectable()
export class ScheduleExplorer implements OnModuleInit {
  private readonly logger = new Logger(ScheduleExplorer.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    this.explore();
  }

  private explore(): void {
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      const methodNames = this.metadataScanner.getAllMethodNames(prototype);
      for (const methodName of methodNames) {
        this.lookupCron(instance, methodName);
        this.lookupInterval(instance, methodName);
        this.lookupTimeout(instance, methodName);
      }
    }
  }

  private lookupCron(instance: InstanceTarget, methodName: string): void {
    const metadata = this.reflector.get<CronMetadata>(
      SCHEDULE_CRON_METADATA,
      instance[methodName],
    );
    if (!metadata) return;

    const className = instance.constructor?.name ?? 'UnknownClass';
    const name = metadata.options.name ?? `${className}.${methodName}`;
    const cronExpression = normalizeCronExpression(metadata.cronExpression);

    this.logger.log(
      `Registering cron job "${name}" with expression "${cronExpression}"`,
    );

    const baker = this.schedulerRegistry.getBaker();
    baker.add({
      name,
      cron: cronExpression,
      callback: async () => {
        await instance[methodName].call(instance);
      },
      onError: (error: Error) => {
        this.logger.error(
          `Cron job "${name}" failed: ${error.message}`,
          error.stack,
        );
      },
    });
    baker.bake(name);
  }

  private lookupInterval(instance: InstanceTarget, methodName: string): void {
    const metadata = this.reflector.get<IntervalMetadata>(
      SCHEDULE_INTERVAL_METADATA,
      instance[methodName],
    );
    if (!metadata) return;

    const className = instance.constructor?.name ?? 'UnknownClass';
    const name = metadata.name ?? `${className}.${methodName}`;

    this.logger.log(
      `Registering interval "${name}" with timeout ${metadata.timeout}ms`,
    );

    const callback = async () => {
      try {
        await instance[methodName].call(instance);
      } catch (error) {
        this.logger.error(
          `Interval "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    if (metadata.options.fireOnStart) {
      void callback();
    }

    const ref = setInterval(callback, metadata.timeout);

    this.schedulerRegistry.addInterval(name, ref);
  }

  private lookupTimeout(instance: InstanceTarget, methodName: string): void {
    const metadata = this.reflector.get<TimeoutMetadata>(
      SCHEDULE_TIMEOUT_METADATA,
      instance[methodName],
    );
    if (!metadata) return;

    const className = instance.constructor?.name ?? 'UnknownClass';
    const name = metadata.name ?? `${className}.${methodName}`;

    this.logger.log(
      `Registering timeout "${name}" with delay ${metadata.timeout}ms`,
    );

    const ref = setTimeout(async () => {
      try {
        await instance[methodName].call(instance);
      } catch (error) {
        this.logger.error(
          `Timeout "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, metadata.timeout);

    this.schedulerRegistry.addTimeout(name, ref);
  }
}
