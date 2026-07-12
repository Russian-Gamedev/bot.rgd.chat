import { EntityManager } from '@mikro-orm/core';
import { EntityManager as PostgreSqlEntityManager } from '@mikro-orm/postgresql';
import { Global, Module } from '@nestjs/common';
import { Client } from 'discord.js';

import type {
  AuthenticatedActor,
  Permission,
} from '#core/permissions/permissions.types';

@Global()
@Module({
  providers: [
    {
      provide: Client,
      useValue: {} as unknown as Client<boolean>,
    },
    {
      provide: PostgreSqlEntityManager,
      useFactory: (em: EntityManager) => em,
      inject: [EntityManager],
    },
  ],
  exports: [Client, PostgreSqlEntityManager],
})
class MockExternalServicesModule {}

function createPermissionMock(reviewerId: string) {
  return {
    hasPermission: async (actor: AuthenticatedActor, _permission: Permission) =>
      actor.id === reviewerId,
  };
}

export { createPermissionMock, MockExternalServicesModule };
