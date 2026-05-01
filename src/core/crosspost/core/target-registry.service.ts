import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { CrossPostTargetAdapter } from '../types/crosspost.types';
import { CrossPostTargetKind } from '../types/crosspost.types';

import { CROSSPOST_TARGET_ADAPTERS } from './crosspost.tokens';

@Injectable()
export class CrossPostTargetRegistry {
  private readonly adapters: Map<CrossPostTargetKind, CrossPostTargetAdapter>;

  constructor(
    @Inject(CROSSPOST_TARGET_ADAPTERS)
    adapters: CrossPostTargetAdapter[],
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.kind, adapter]));
  }

  get(kind: CrossPostTargetKind) {
    const adapter = this.adapters.get(kind);
    if (!adapter)
      throw new NotFoundException(`Crosspost target ${kind} not found`);
    return adapter;
  }
}
