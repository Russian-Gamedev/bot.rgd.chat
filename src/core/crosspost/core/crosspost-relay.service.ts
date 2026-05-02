import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';

import { CrossPostDeliveryEntity } from '../entities/crosspost-delivery.entity';
import { CrossPostRouteEntity } from '../entities/crosspost-route.entity';
import type { CrossPostEvent } from '../types/crosspost.types';

import { CrossPostRouteService } from './crosspost-route.service';
import { CrossPostTargetRegistry } from './target-registry.service';

@Injectable()
export class CrossPostRelayService {
  private readonly logger = new Logger(CrossPostRelayService.name);

  constructor(
    @InjectRepository(CrossPostDeliveryEntity)
    private readonly deliveryRepository: EntityRepository<CrossPostDeliveryEntity>,
    private readonly routeService: CrossPostRouteService,
    private readonly targetRegistry: CrossPostTargetRegistry,
    private readonly em: EntityManager,
  ) {}

  async relay(event: CrossPostEvent) {
    const routes = await this.routeService.findEnabledRoutes(
      event.sourceKind,
      event.sourceKey,
    );

    for (const route of routes) {
      await this.relayToRoute(route, event);
    }
  }

  async relayToRoute(route: CrossPostRouteEntity, event: CrossPostEvent) {
    if (event.kind === 'edit' && !route.settings.relayEdits) return;
    if (event.kind === 'delete' && !route.settings.relayDeletes) return;

    const targets = route.targets.filter((target) => target.enabled);

    for (const target of targets) {
      try {
        const adapter = this.targetRegistry.get(target.kind);
        const delivery = await this.deliveryRepository.findOne({
          routeId: route.id,
          targetId: target.id,
          sourceMessageId: event.sourceMessageId,
        });

        if (event.kind === 'delete') {
          if (!delivery || delivery.deletedAt) continue;
          await adapter.delete(target, delivery.targetMessageId);
          delivery.deletedAt = new Date();
          await this.em.persist(delivery).flush();
          continue;
        }

        if (delivery && !delivery.deletedAt) {
          await adapter.edit(target, delivery.targetMessageId, event);
          continue;
        }

        if (event.kind === 'edit') continue;

        const targetMessageId = await adapter.create(target, event);
        const nextDelivery = new CrossPostDeliveryEntity();
        nextDelivery.routeId = route.id;
        nextDelivery.targetId = target.id;
        nextDelivery.sourceKey = event.sourceKey;
        nextDelivery.sourceMessageId = event.sourceMessageId;
        nextDelivery.targetMessageId = targetMessageId;
        await this.em.persist(nextDelivery).flush();
      } catch (error) {
        this.logger.warn(
          `Failed to relay crosspost route ${route.id} target ${target.id}: ${String(
            error,
          )}`,
        );
      }
    }
  }
}
