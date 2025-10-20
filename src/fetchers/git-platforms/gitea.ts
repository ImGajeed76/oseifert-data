import { BaseGitPlatformClient } from './base';
import type { RepoData, UserProfile, LicenseData } from '../../types';

interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  website: string | null;
  language: string | null;
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  size: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
  private: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  topics: string[];
  default_branch: string;
}

interface GiteaUser {
  id: number;
  login: string;
  full_name: string;
  email: string;
  avatar_url: string;
  language: string;
  is_admin: boolean;
  last_login: string;
  created: string;
  restricted: boolean;
  location: string;
  website: string;
  description: string;
  visibility: string;
  followers_count: number;
  following_count: number;
  starred_repos_count: number;
  username: string;
}

interface GiteaFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content: string;
  encoding: string;
}

export class GiteaClient extends BaseGitPlatformClient {
  constructor(baseUrl: string = 'https://codeberg.org', token?: string) {
    super(baseUrl, token);
  }

  async getRepo(owner: string, repo: string): Promise<RepoData> {
    const url = `${this.baseUrl}/api/v1/repos/${owner}/${repo}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GiteaRepo = await response.json();
      return this.transformRepoData(data);
    } catch (error: any) {
      throw new Error(`Failed to fetch repository ${owner}/${repo}: ${error.message}`);
    }
  }

  async getReadme(owner: string, repo: string): Promise<string> {
    const readmeFiles = ['README.md', 'README.rst', 'README.txt', 'README'];

    for (const filename of readmeFiles) {
      try {
        const url = `${this.baseUrl}/api/v1/repos/${owner}/${repo}/contents/${filename}`;

        const response = await fetch(url, {
          headers: this.getHeaders()
        });

        if (response.ok) {
          const data: GiteaFileContent = await response.json();
          
          if (data.encoding === 'base64') {
            return Buffer.from(data.content, 'base64').toString('utf-8');
          }
          
          // If not base64, try to get raw content
          if (data.download_url) {
            const rawResponse = await fetch(data.download_url);
            if (rawResponse.ok) {
              return await rawResponse.text();
            }
          }
        }
      } catch (error) {
        // Continue to next filename
      }
    }

    return ''; // No README found
  }

  async getLicense(owner: string, repo: string): Promise<LicenseData | null> {
    const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING'];

    for (const filename of licenseFiles) {
      try {
        const url = `${this.baseUrl}/api/v1/repos/${owner}/${repo}/contents/${filename}`;

        const response = await fetch(url, {
          headers: this.getHeaders()
        });

        if (response.ok) {
          const data: GiteaFileContent = await response.json();
          
          let text = '';
          if (data.encoding === 'base64') {
            text = Buffer.from(data.content, 'base64').toString('utf-8');
          } else if (data.download_url) {
            const rawResponse = await fetch(data.download_url);
            if (rawResponse.ok) {
              text = await rawResponse.text();
            }
          }

          return {
            name: this.detectLicenseType(text),
            text,
            url: data.html_url
          };
        }
      } catch (error) {
        // Continue to next filename
      }
    }

    return null;
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const url = `${this.baseUrl}/api/v1/repos/${owner}/${repo}/languages`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        return {};
      }

      const data = await response.json();
      return data as Record<string, number>;
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
        const url = `${this.baseUrl}/api/v1/users/${username}/repos?page=${page}&limit=${perPage}`;

        const response = await fetch(url, {
          headers: this.getHeaders()
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: GiteaRepo[] = await response.json();

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

      // Sort by updated date (newest first)
      repos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return repos;
    } catch (error: any) {
      throw new Error(`Failed to list repositories for ${username}: ${error.message}`);
    }
  }

  async getUser(username: string): Promise<UserProfile> {
    const url = `${this.baseUrl}/api/v1/users/${username}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GiteaUser = await response.json();
      
      return {
        username: data.login || data.username,
        name: data.full_name,
        bio: data.description || '',
        location: data.location || '',
        company: '',
        website: data.website || '',
        publicRepos: data.starred_repos_count || 0,
        followers: data.followers_count || 0,
        following: data.following_count || 0,
        createdAt: data.created,
        profileUrl: `${this.baseUrl}/${data.login || data.username}`
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch user ${username}: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v1/version`;
      const response = await fetch(url, {
        headers: this.getHeaders()
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getPlatformType(): string {
    const hostname = new URL(this.baseUrl).hostname.toLowerCase();
    
    if (hostname === 'codeberg.org') return 'codeberg';
    if (hostname.includes('forgejo')) return 'forgejo';
    return 'gitea';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    return headers;
  }

  private transformRepoData(repo: GiteaRepo): RepoData {
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      homepage: repo.website,
      language: repo.language,
      stars: repo.stars_count,
      forks: repo.forks_count,
      watchers: repo.watchers_count,
      openIssues: repo.open_issues_count,
      size: repo.size,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.updated_at, // Gitea doesn't have separate pushed_at
      archived: repo.archived,
      private: repo.private,
      topics: repo.topics || [],
      hasWiki: repo.has_wiki,
      hasPages: repo.has_pages
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