import type { RepoData, UserProfile, LicenseData } from '../../types';

export interface GitPlatformClient {
  // Repository operations
  getRepo(owner: string, repo: string): Promise<RepoData>;
  getReadme(owner: string, repo: string): Promise<string>;
  getLicense(owner: string, repo: string): Promise<LicenseData | null>;
  getLanguages(owner: string, repo: string): Promise<Record<string, number>>;
  listRepos(username: string): Promise<RepoData[]>;
  
  // User operations
  getUser(username: string): Promise<UserProfile>;
  
  // Utility
  isAvailable(): Promise<boolean>;
  getPlatformType(): string;
}

export abstract class BaseGitPlatformClient implements GitPlatformClient {
  protected token?: string;
  protected baseUrl: string;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  abstract getRepo(owner: string, repo: string): Promise<RepoData>;
  abstract getReadme(owner: string, repo: string): Promise<string>;
  abstract getLicense(owner: string, repo: string): Promise<LicenseData | null>;
  abstract getLanguages(owner: string, repo: string): Promise<Record<string, number>>;
  abstract listRepos(username: string): Promise<RepoData[]>;
  abstract getUser(username: string): Promise<UserProfile>;
  abstract isAvailable(): Promise<boolean>;
  abstract getPlatformType(): string;
}