import { Injectable, Logger } from '@nestjs/common';

export interface GitInfo {
  branch: string;
  commit: string;
  commitMessage: string;
  shortCommit: string;
  branchLink: string;
  commitLink: string;
}

@Injectable()
export class GitInfoService {
  private readonly logger = new Logger(GitInfoService.name);
  private readonly gitBranch: string;
  private readonly gitCommit: string;
  private readonly gitCommitMessage: string;
  private readonly repoOwner = 'Russian-Gamedev';
  private readonly repoName = 'rgd-bot';

  constructor() {
    this.gitBranch = process.env.GIT_BRANCH ?? 'dev';
    this.gitCommit = process.env.GIT_COMMIT ?? 'dev';
    this.gitCommitMessage =
      process.env.GIT_COMMIT_MESSAGE ?? 'No commit message';
  }

  getGitInfo(): GitInfo {
    return {
      branch: this.gitBranch,
      commit: this.gitCommit,
      commitMessage: this.gitCommitMessage,
      shortCommit: this.gitCommit.slice(0, 7),
      branchLink: `https://github.com/${this.repoOwner}/${this.repoName}/tree/${this.gitBranch}`,
      commitLink: `https://github.com/${this.repoOwner}/${this.repoName}/commit/${this.gitCommit}`,
    };
  }

  logGitInfo() {
    const gitInfo = this.getGitInfo();

    this.logger.log('🔗 Git Information:');
    this.logger.log(`   Branch: ${gitInfo.branch}`);
    this.logger.log(`   Commit: ${gitInfo.shortCommit}`);
    this.logger.log(`   Message: ${gitInfo.commitMessage}`);
    this.logger.log(`   Branch URL: ${gitInfo.branchLink}`);
    this.logger.log(`   Commit URL: ${gitInfo.commitLink}`);
  }
}
