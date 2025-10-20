// Base Project Interface (required output format)
export interface Project {
  title: string;
  portfolioUrl: string;
  repoUrl?: string;          // Changed from githubUrl - any git platform
  liveUrl?: string;
  description: string;
  role: string;
  technologies: string[];
  status: string;            // "Active" | "Archived" | "Maintenance" | "In Progress" or other
}

// Curated Project (has markdown file)
export interface CuratedProject extends Project {
  content: string;           // Full markdown content from <!-- content --> section
  readme: string;            // README.md content
  license: LicenseData | null;
  stats: RepoStats;
  platform: PlatformInfo;
}

// All Projects (includes non-curated repos)
export interface AllProject extends Project {
  isCurated: boolean;
  readme: string;
  license: LicenseData | null;
  stats: RepoStats;
  platform: PlatformInfo;
  topics: string[];
  isPrivate: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  content?: string; // Only present for curated projects
}

// Repository Statistics
export interface RepoStats {
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  lastUpdated: string;       // ISO 8601
  createdAt: string;         // ISO 8601
  size: number;              // KB
  language: string;          // Primary language
  languages: Language[];     // All languages with percentages
}

// Language Information
export interface Language {
  name: string;
  bytes: number;
  percentage: number;
  color: string;             // Use getLanguageColor() from colors.ts
}

// License Information
export interface LicenseData {
  name: string;              // e.g., "MIT", "Apache-2.0"
  text: string;              // Full license text
  spdxId?: string;           // SPDX identifier if available
  url?: string;              // License file URL
}

// Platform Information
export interface PlatformInfo {
  type: string;              // 'github' | 'gitlab' | 'gitea' | 'codeberg' | 'forgejo' | 'unknown'
  url: string;               // Full repo URL
  apiAvailable: boolean;     // Whether we could fetch via API
}

// Markdown Frontmatter
export interface MarkdownFrontmatter {
  title: string;
  repoUrl: string;           // Full URL to repo (any platform)
  liveUrl?: string;
  role: string;
  technologies: string[];
  status: string;
}

// Parsed Markdown
export interface ParsedMarkdown {
  frontmatter: MarkdownFrontmatter;
  description: string;       // Content from <!-- description --> section
  content: string;           // Content from <!-- content --> section
}

// Profile Statistics
export interface ProfileStats {
  platforms: Record<string, PlatformProfile>;
  aggregated: AggregatedStats;
  fetchedAt: string;         // ISO 8601
}

export interface PlatformProfile {
  username: string;
  name: string;
  bio: string;
  location: string;
  company: string;
  website: string;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: string;
  profileUrl: string;
}

export interface AggregatedStats {
  totalRepos: number;
  totalStars: number;
  totalForks: number;
  languageBreakdown: Record<string, {bytes: number; repos: number}>;
  mostUsedLanguages: Array<{
    language: string;
    repoCount: number;
    totalBytes: number;
    percentage: number;
  }>;
  topRepositories: Array<{
    name: string;
    platform: string;
    stars: number;
    forks: number;
    url: string;
  }>;
  licenseBreakdown: Record<string, number>;
}

// Git Platform Detection
export interface GitPlatformInfo {
  type: 'github' | 'gitlab' | 'gitea' | 'forgejo' | 'codeberg' | 'bitbucket' | 'unknown';
  owner: string;
  repo: string;
  baseUrl: string;           // e.g., "https://github.com"
  apiSupported: boolean;
}

// Repository Data (internal, from API)
export interface RepoData {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  homepage: string | null;
  language: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  size: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  archived: boolean;
  private: boolean;
  topics: string[];
  hasWiki: boolean;
  hasPages: boolean;
}

// User Profile Data (internal, from API)
export interface UserProfile {
  username: string;
  name: string;
  bio: string;
  location: string;
  company: string;
  website: string;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: string;
  profileUrl: string;
}