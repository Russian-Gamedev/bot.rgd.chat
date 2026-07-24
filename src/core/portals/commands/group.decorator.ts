import { InteractionContextType } from 'discord.js';
import { createCommandGroupDecorator } from 'necord';

export const PortalCommandDecorator = createCommandGroupDecorator({
  name: 'portal',
  description: 'Portal management commands',
  defaultMemberPermissions: 'Administrator',
  contexts: [InteractionContextType.Guild],
});
