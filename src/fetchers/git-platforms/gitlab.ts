import { BaseGitPlatformClient } from './base';
import type { RepoData, UserProfile, LicenseData } from '../../types';

interface GitLabRepo {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  web_url: string;
  star_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  last_activity_at: string;
  archived: boolean;
  visibility: string;
  topics: string[];
  wiki_enabled: boolean;
  pages_access_level: string;
  default_branch: string;
  homepage?: string;
}

interface GitLabUser {
  id: number;
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  public_email: string | null;
  web_url: string;
  created_at: string;
  followers: number;
  following: number;
}

export class GitLabClient extends BaseGitPlatformClient {
  constructor(baseUrl: string = 'https://gitlab.com', token?: string) {
    super(baseUrl, token);
  }

  async getRepo(owner: string, repo: string): Promise<RepoData> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const url = `${this.baseUrl}/api/v4/projects/${projectPath}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GitLabRepo = await response.json();
      return this.transformRepoData(data);
    } catch (error: any) {
      throw new Error(`Failed to fetch repository ${owner}/${repo}: ${error.message}`);
    }
  }

  async getReadme(owner: string, repo: string): Promise<string> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const readmeFiles = ['README.md', 'README.rst', 'README.txt', 'README'];

    for (const filename of readmeFiles) {
      try {
        const filePath = encodeURIComponent(filename);
        const url = `${this.baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=main`;

        const response = await fetch(url, {
          headers: this.getHeaders()
        });

        if (response.ok) {
          return await response.text();
        }

        // Try master branch if main doesn't work
        const masterUrl = `${this.baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=master`;
        const masterResponse = await fetch(masterUrl, {
          headers: this.getHeaders()
        });

        if (masterResponse.ok) {
          return await masterResponse.text();
        }
      } catch (error) {
        // Continue to next filename
      }
    }

    return ''; // No README found
  }

  async getLicense(owner: string, repo: string): Promise<LicenseData | null> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING'];

    for (const filename of licenseFiles) {
      try {
        const filePath = encodeURIComponent(filename);
        const url = `${this.baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=main`;

        const response = await fetch(url, {
          headers: this.getHeaders()
        });

        if (response.ok) {
          const text = await response.text();
          return {
            name: this.detectLicenseType(text),
            text,
            url: `${this.baseUrl}/${owner}/${repo}/-/blob/main/${filename}`
          };
        }

        // Try master branch
        const masterUrl = `${this.baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=master`;
        const masterResponse = await fetch(masterUrl, {
          headers: this.getHeaders()
        });

        if (masterResponse.ok) {
          const text = await masterResponse.text();
          return {
            name: this.detectLicenseType(text),
            text,
            url: `${this.baseUrl}/${owner}/${repo}/-/blob/master/${filename}`
          };
        }
      } catch (error) {
        // Continue to next filename
      }
    }

    return null;
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const url = `${this.baseUrl}/api/v4/projects/${projectPath}/languages`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        return {};
      }

      const data = await response.json();
      
      // GitLab returns percentages, convert to approximate byte counts
      const languages: Record<string, number> = {};
      const totalSize = 100000; // Assume 100KB total for percentage calculation
      
      for (const [language, percentage] of Object.entries(data)) {
        languages[language] = Math.round((percentage as number) * totalSize / 100);
      }

      return languages;
    } catch (error: any) {
      console.warn(`Failed to fetch languages for ${owner}/${repo}:`, error.message);
      return {};
    }
  }

  async listRepos(username: string): Promise<RepoData[]> {
    const repos: RepoData[] = [];
    let page = 1;
    const perPage = 50;
    let hasMoreRepos = true;

    try {
      while (hasMoreRepos) {
        const url = `${this.baseUrl}/api/v4/users/${username}/projects?per_page=${perPage}&page=${page}&order_by=last_activity_at&sort=desc`;

        const response = await fetch(url, {
          headers: this.getHeaders()
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: GitLabRepo[] = await response.json();

        if (data.length === 0) {
          hasMoreRepos = false;
          break;
        }

        const transformedRepos = data.map(repo => this.transformRepoData(repo));
        repos.push(...transformedRepos);

        if (data.length < perPage) {
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
    const url = `${this.baseUrl}/api/v4/users?username=${username}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GitLabUser[] = await response.json();
      
      if (data.length === 0) {
        throw new Error(`User ${username} not found`);
      }

      const user = data[0];
      return {
        username: user.username,
        name: user.name,
        bio: user.bio || '',
        location: user.location || '',
        company: '',
        website: user.public_email || '',
        publicRepos: 0, // Not directly available in GitLab API user endpoint
        followers: user.followers || 0,
        following: user.following || 0,
        createdAt: user.created_at,
        profileUrl: user.web_url
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch user ${username}: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v4/user`;
      const response = await fetch(url, {
        headers: this.getHeaders()
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getPlatformType(): string {
    return 'gitlab';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['PRIVATE-TOKEN'] = this.token;
    }

    return headers;
  }

  private transformRepoData(repo: GitLabRepo): RepoData {
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.path_with_namespace,
      description: repo.description,
      htmlUrl: repo.web_url,
      homepage: repo.homepage || null,
      language: null, // GitLab doesn't provide primary language in repo endpoint
      stars: repo.star_count,
      forks: repo.forks_count,
      watchers: repo.star_count, // GitLab doesn't have separate watchers
      openIssues: repo.open_issues_count,
      size: 0, // Not available in GitLab API
      createdAt: repo.created_at,
      updatedAt: repo.last_activity_at,
      pushedAt: repo.last_activity_at,
      archived: repo.archived,
      private: repo.visibility === 'private',
      topics: repo.topics || [],
      hasWiki: repo.wiki_enabled,
      hasPages: repo.pages_access_level !== 'disabled'
    };
  }

  private detectLicenseType(licenseText: string): string {
    const text = licenseText.toLowerCase();
    
    if (text.includes('mit license')) return 'MIT';
    if (text.includes('apache license')) return 'Apache-2.0';
    if (text.includes('gnu general public license')) {
      if (text.includes('version 3')) return 'GPL-3.0';
      if (text.includes('version 2')) return 'GPL-2.0';
      return 'GPL';
    }
    if (text.includes('bsd license')) return 'BSD';
    if (text.includes('mozilla public license')) return 'MPL-2.0';
    if (text.includes('unlicense')) return 'Unlicense';
    
    return 'Unknown';
  }
}