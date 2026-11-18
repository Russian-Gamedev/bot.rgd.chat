import { choose, randomInt } from '#lib/utils';

import type { GuildSettingsService } from '../settings/guild-settings.service';

/** Matches a well-formed placeholder: `${name}` or `${name,arg,...}`. */
export const TEMPLATE_TOKEN_REGEX = /\$\{([^{},]+(?:\s*,\s*[^{},]+)*)\}/g;

/** Matches any `${...}` shape, including malformed ones, for validation. */
export const PLACEHOLDER_REGEX = /\$\{([^{}]*)\}/g;

/** Splits a placeholder body into the token name and its arguments. */
export function splitTokenBody(body: string): string[] {
  return body.split(',').map((part) => part.trim());
}

export interface TemplateTokenDefinition {
  /** Argument count bounds after the token name. */
  minArgs: number;
  maxArgs: number;
  /** Returns an error message for invalid arguments, or null when valid. */
  validateArgs?: (args: string[]) => string | null;
  /** Self-contained render used by buildTemplate. */
  resolve?: (args: string[]) => string;
  /**
   * Guild-dependent render; getRandom resolves these into params before
   * buildTemplate because they need Discord state.
   */
  resolveGuild?: (
    settings: GuildSettingsService,
    guildId: string,
  ) => Promise<string | null>;
}

/** Registry of dynamic template tokens, looked up by the first body token. */
export const TEMPLATE_TOKENS: Record<string, TemplateTokenDefinition> = {
  /** A random member with the guild's active role, as a `<@id>` mention. */
  active: {
    minArgs: 0,
    maxArgs: 0,
    async resolveGuild(settings, guildId) {
      const role = await settings.getActiveRole(guildId);
      if (!role || role.members.size === 0) return null;
      return `<@${choose([...role.members.keys()])}>`;
    },
  },
  /** A random integer between min and max, inclusively. */
  irandom: {
    minArgs: 2,
    maxArgs: 2,
    validateArgs: ([min, max]) =>
      !/^-?\d+$/.test(min) || !/^-?\d+$/.test(max)
        ? 'expects two integers'
        : Number(min) > Number(max)
          ? 'expects min <= max'
          : null,
    resolve: ([min, max]) => String(randomInt(Number(min), Number(max))),
  },
  /** One randomly picked argument; arguments may contain spaces. */
  choose: {
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    resolve: choose,
  },
};

/** Human-readable argument count for validation errors. */
export function describeTokenArity({
  minArgs,
  maxArgs,
}: TemplateTokenDefinition) {
  if (maxArgs === Number.POSITIVE_INFINITY) {
    return `at least ${minArgs} argument(s)`;
  }
  if (minArgs === maxArgs) return `exactly ${minArgs} argument(s)`;
  return `from ${minArgs} to ${maxArgs} arguments`;
}
