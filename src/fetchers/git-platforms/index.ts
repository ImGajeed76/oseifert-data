import { GitPlatformClient } from './base';
import { GitHubClient } from './github';
import { GitLabClient } from './gitlab';
import { GiteaClient } from './gitea';
import type { GitPlatformInfo } from '../../types';

export function createPlatformClient(platformInfo: GitPlatformInfo, token?: string): GitPlatformClient {
  switch (platformInfo.type) {
    case 'github':
      return new GitHubClient(token);
    case 'gitlab':
      return new GitLabClient(platformInfo.baseUrl, token);
    case 'gitea':
    case 'forgejo':
    case 'codeberg':
      return new GiteaClient(platformInfo.baseUrl, token);
    default:
      throw new Error(`Unsupported platform: ${platformInfo.type}`);
  }
}

export { GitHubClient, GitLabClient, GiteaClient };
export type { GitPlatformClient };