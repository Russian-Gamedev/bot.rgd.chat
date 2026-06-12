import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { UserService } from './users.service';

@Injectable()
export class UserRefreshService {
  private readonly logger = new Logger(UserRefreshService.name);
  private isRunning = false;

  constructor(private readonly userService: UserService) {}

  @Cron('0 */6 * * *', { name: 'refresh-users-profile' })
  async refreshUsersProfile() {
    if (this.isRunning) {
      this.logger.warn('User profile refresh is already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      this.logger.log('Refreshing users avatar URLs and nicknames');
      const { refreshed, failed } = await this.userService.refreshUsersData();

      this.logger.log(
        `Users profile refresh finished: ${refreshed} refreshed, ${failed} failed`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
