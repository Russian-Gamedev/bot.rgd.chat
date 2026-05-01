import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CreateCrossPostRouteDto,
  UpdateCrossPostRouteDto,
} from '../dto/crosspost-route.dto';
import { CrossPostDeliveryEntity } from '../entities/crosspost-delivery.entity';
import { CrossPostRouteEntity } from '../entities/crosspost-route.entity';
import type { CrossPostSettings } from '../types/crosspost.types';
import { CrossPostSourceKind, CrossPostTarget } from '../types/crosspost.types';

import { CrossPostSourceRegistry } from './source-registry.service';
import { CrossPostTargetRegistry } from './target-registry.service';

const DEFAULT_SETTINGS: CrossPostSettings = {
  relayEdits: true,
  relayDeletes: true,
  allowedMentions: 'none',
};

@Injectable()
export class CrossPostRouteService {
  constructor(
    @InjectRepository(CrossPostRouteEntity)
    private readonly routeRepository: EntityRepository<CrossPostRouteEntity>,
    @InjectRepository(CrossPostDeliveryEntity)
    private readonly deliveryRepository: EntityRepository<CrossPostDeliveryEntity>,
    private readonly em: EntityManager,
    private readonly sourceRegistry: CrossPostSourceRegistry,
    private readonly targetRegistry: CrossPostTargetRegistry,
  ) {}

  async listRoutes() {
    return this.routeRepository.findAll({ orderBy: { createdAt: 'desc' } });
  }

  async getRoute(id: string) {
    const route = await this.routeRepository.findOne({ id });
    if (!route) throw new NotFoundException('Crosspost route not found');
    return route;
  }

  async findEnabledRoutes(sourceKind: CrossPostSourceKind, sourceKey: string) {
    return this.routeRepository.find({
      enabled: true,
      sourceKind,
      sourceKey,
    });
  }

  async createRoute(dto: CreateCrossPostRouteDto) {
    const route = new CrossPostRouteEntity();
    const normalized = this.normalizeRouteInput(dto);

    route.name = normalized.name;
    route.enabled = normalized.enabled;
    route.sourceKind = normalized.sourceKind;
    route.sourceConfig = normalized.sourceConfig;
    route.sourceKey = normalized.sourceKey;
    route.targets = normalized.targets;
    route.settings = normalized.settings;

    await this.em.persist(route).flush();
    return route;
  }

  async updateRoute(id: string, dto: UpdateCrossPostRouteDto) {
    const route = await this.getRoute(id);
    const normalized = this.normalizeRouteInput({
      name: dto.name ?? route.name,
      enabled: dto.enabled ?? route.enabled,
      sourceKind: dto.sourceKind ?? route.sourceKind,
      sourceConfig: dto.sourceConfig ?? route.sourceConfig,
      targets: (dto.targets ??
        route.targets) as CreateCrossPostRouteDto['targets'],
      settings: { ...route.settings, ...dto.settings },
    });

    route.name = normalized.name;
    route.enabled = normalized.enabled;
    route.sourceKind = normalized.sourceKind;
    route.sourceConfig = normalized.sourceConfig;
    route.sourceKey = normalized.sourceKey;
    route.targets = normalized.targets;
    route.settings = normalized.settings;

    await this.em.persist(route).flush();
    return route;
  }

  async deleteRoute(id: string) {
    const route = await this.getRoute(id);
    await this.deliveryRepository.nativeDelete({ routeId: route.id });
    await this.em.remove(route).flush();
  }

  private normalizeRouteInput(dto: CreateCrossPostRouteDto) {
    const sourceAdapter = this.sourceRegistry.get(dto.sourceKind);
    const sourceConfig = sourceAdapter.normalizeConfig(dto.sourceConfig);

    const targets = this.normalizeTargets(dto.targets);
    const enabledTargets = targets.filter((target) => target.enabled);
    if (enabledTargets.length === 0) {
      throw new BadRequestException(
        'Route must have at least one enabled target',
      );
    }

    return {
      name: dto.name,
      enabled: dto.enabled ?? true,
      sourceKind: dto.sourceKind,
      sourceConfig,
      sourceKey: sourceAdapter.buildSourceKey(sourceConfig),
      targets,
      settings: {
        ...DEFAULT_SETTINGS,
        ...dto.settings,
        allowedMentions: 'none' as const,
      },
    };
  }

  private normalizeTargets(
    targets: CreateCrossPostRouteDto['targets'] | CrossPostTarget[],
  ) {
    const urls = new Set<string>();

    return targets.map((target) => {
      const adapter = this.targetRegistry.get(target.kind);
      const normalized = adapter.normalizeTarget(
        target as Partial<CrossPostTarget>,
      );

      const dedupeKey =
        typeof normalized.webhookUrl === 'string'
          ? normalized.webhookUrl
          : normalized.id;
      if (urls.has(dedupeKey)) {
        throw new BadRequestException('Duplicate webhook target URL');
      }
      urls.add(dedupeKey);

      return normalized;
    });
  }
}
