import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { CrossPostSourceAdapter } from '../types/crosspost.types';
import { CrossPostSourceKind } from '../types/crosspost.types';

import { CROSSPOST_SOURCE_ADAPTERS } from './crosspost.tokens';

@Injectable()
export class CrossPostSourceRegistry {
  private readonly adapters: Map<CrossPostSourceKind, CrossPostSourceAdapter>;

  constructor(
    @Inject(CROSSPOST_SOURCE_ADAPTERS)
    adapters: CrossPostSourceAdapter[],
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.kind, adapter]));
  }

  get(kind: CrossPostSourceKind) {
    const adapter = this.adapters.get(kind);
    if (!adapter)
      throw new NotFoundException(`Crosspost source ${kind} not found`);
    return adapter;
  }
}
