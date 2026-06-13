import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { BotsService } from './bots.service';

@Injectable()
export class BotApiGuard implements CanActivate {
  constructor(private readonly botsService: BotsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader)
      throw new ForbiddenException('Missing authorization header');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token)
      throw new ForbiddenException('Invalid authorization header');

    const bot = await this.botsService.verifyToken(token);

    if (!bot) throw new ForbiddenException('Invalid bot token');
    request.bot = bot;
    return true;
  }
}
