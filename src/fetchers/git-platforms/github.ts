import { Octokit } from '@octokit/rest';
import type { Endpoints } from '@octokit/types';
import { BaseGitPlatformClient } from './base';
import type { RepoData, UserProfile, LicenseData } from '../../types';

type GetRepoResponseData = Endpoints['GET /repos/{owner}/{repo}']['response']['data'];
type GetUserResponseData = Endpoints['GET /users/{username}']['response']['data'];

export class GitHubClient extends BaseGitPlatformClient {
  private octokit: Octokit;

  constructor(token?: string) {
    super('https://github.com', token);
    this.octokit = new Octokit({
      auth: token
    });
  }

  async getRepo(owner: string, repo: string): Promise<RepoData> {
    try {
      const response = await this.octokit.repos.get({
        owner,
        repo,
        headers: {
          'Accept': 'application/vnd.github.mercy-preview+json'
        }
      });

      const data = response.data;
      return this.transformRepoData(data);
    } catch (error: any) {
      throw new Error(`Failed to fetch repository ${owner}/${repo}: ${error.message}`);
    }
  }

  async getReadme(owner: string, repo: string): Promise<string> {
    try {
      const response = await this.octokit.repos.getReadme({
        owner,
        repo
      });

      // GitHub returns base64 encoded content
      if ('content' in response.data && response.data.encoding === 'base64') {
        // Remove any whitespace/newlines from base64 string before decoding
        const cleanBase64 = response.data.content.replace(/\s/g, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        // Ensure proper UTF-8 decoding
        return buffer.toString('utf8');
      }
      
      return '';
    } catch (error: any) {
      if (error?.status === 404) {
        return ''; // No README found - this is normal
      }
      // Only log unexpected errors
      console.warn(`Unexpected error fetching README for ${owner}/${repo}:`, error.message);
      return '';
    }
  }

  async getLicense(owner: string, repo: string): Promise<LicenseData | null> {
    try {
      // First try to get license info from the repo endpoint
      const repoResponse = await this.octokit.repos.get({ 
        owner, 
        repo,
        headers: {
          'Accept': 'application/vnd.github.mercy-preview+json'
        }
      });
      
      if (repoResponse.data.license) {
        // Try to get the license file content - try multiple common names
        const licenseFileNames = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license', 'license.txt', 'license.md'];
        let licenseText = '';
        
        for (const fileName of licenseFileNames) {
          try {
            const licenseResponse = await this.octokit.repos.getContent({
              owner,
              repo,
              path: fileName
            });

            if ('content' in licenseResponse.data && licenseResponse.data.encoding === 'base64') {
              const cleanBase64 = licenseResponse.data.content.replace(/\s/g, '');
              const buffer = Buffer.from(cleanBase64, 'base64');
              licenseText = buffer.toString('utf8');
              break; // Found license file, stop searching
            }
          } catch {
            // Try next filename
            continue;
          }
        }

        return {
          name: repoResponse.data.license.name,
          text: licenseText,
          spdxId: repoResponse.data.license.spdx_id || undefined,
          url: repoResponse.data.license.url || undefined
        };
      }

      return null;
    } catch (error: any) {
      console.warn(`Failed to fetch license for ${owner}/${repo}:`, error.message);
      return null;
    }
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      const response = await this.octokit.repos.listLanguages({
        owner,
        repo
      });
      return response.data;
    } catch (error: any) {
      console.warn(`Failed to fetch languages for ${owner}/${repo}:`, error.message);
      return {};
    }
  }

  async listRepos(username: string): Promise<RepoData[]> {
    const repos: RepoData[] = [];
    let page = 1;
    const perPage = 30;
    let hasMoreRepos = true;

    try {
      while (hasMoreRepos) {
        const response = await this.octokit.repos.listForUser({
          username,
          type: 'owner',
          sort: 'updated',
          per_page: perPage,
          page: page,
          headers: {
            'Accept': 'application/vnd.github.mercy-preview+json'
          }
        });

        if (response.data.length === 0) {
          hasMoreRepos = false;
          break;
        }

        // Transform each repo
        const transformedRepos = response.data.map(repo => this.transformRepoData(repo));
        repos.push(...transformedRepos);

        // Check if we received fewer repos than requested, indicating the last page
        if (response.data.length < perPage) {
          hasMoreRepos = false;
        } else {
          page++;
        }
      }

      return repos;
    } catch (error: any) {
      throw new Error(`Failed to list repositories for ${username}: ${error.message}`);
    }
  }

  async getUser(username: string): Promise<UserProfile> {
    try {
      const response = await this.octokit.users.getByUsername({
        username
      });

      const data = response.data;
      return {
        username: data.login,
        name: data.name || '',
        bio: data.bio || '',
        location: data.location || '',
        company: data.company || '',
        website: data.blog || '',
        publicRepos: data.public_repos,
        followers: data.followers,
        following: data.following,
        createdAt: data.created_at,
        profileUrl: data.html_url
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch user ${username}: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.octokit.rest.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  getPlatformType(): string {
    return 'github';
  }

  private transformRepoData(repo: GetRepoResponseData): RepoData {
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      homepage: repo.homepage,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      watchers: repo.watchers_count,
      openIssues: repo.open_issues_count,
      size: repo.size,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at || repo.updated_at,
      archived: repo.archived,
      private: repo.private,
      topics: repo.topics || [],
      hasWiki: repo.has_wiki,
      hasPages: repo.has_pages
    };
  }
}