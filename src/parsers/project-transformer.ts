import { getLanguageColor } from '../utils/colors';
import { 
  cleanDescription, 
  extractTechnologiesFromTopics, 
  extractTechnologiesFromLanguages,
  filterProgrammingLanguages 
} from '../utils/text-utils';
import type { 
  RepoData, 
  Language, 
  RepoStats, 
  AllProject, 
  CuratedProject,
  ParsedMarkdown,
  PlatformInfo,
  LicenseData
} from '../types';

// Transform languages data
export function transformLanguages(languages: Record<string, number>): Language[] {
  // Filter out non-programming languages
  const filteredLanguages = filterProgrammingLanguages(languages);
  const entries = Object.entries(filteredLanguages).sort((a, b) => b[1] - a[1]);
  const totalBytes = entries.reduce((sum, [_, bytes]) => sum + bytes, 0);

  return entries.map(([name, bytes]) => ({
    name,
    bytes,
    percentage: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
    color: getLanguageColor(name) || '#333'
  }));
}

// Transform repo data to stats
export function transformRepoStats(
  repo: RepoData,
  languages: Record<string, number>
): RepoStats {
  const transformedLanguages = transformLanguages(languages);

  return {
    stars: repo.stars,
    forks: repo.forks,
    watchers: repo.watchers,
    openIssues: repo.openIssues,
    lastUpdated: repo.updatedAt,
    createdAt: repo.createdAt,
    size: repo.size,
    language: repo.language || 'Unknown',
    languages: transformedLanguages
  };
}

// Generate smart defaults for missing data
export function generateSmartDefaults(repo: RepoData, readme: string, languages: Language[] = []): {
  title: string;
  description: string;
  role: string;
  technologies: string[];
  status: string;
} {
  // Format title from repo name: "my-repo" → "My Repo"
  const title = repo.name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Use repo description, clean it, or extract from README
  let description = '';
  if (repo.description) {
    description = cleanDescription(repo.description);
  } else if (readme) {
    description = cleanDescription(readme);
  }
  
  if (!description) {
    description = 'No description available';
  }

  // Generate technologies from topics first, then languages
  let technologies: string[] = [];
  if (repo.topics.length > 0) {
    technologies = extractTechnologiesFromTopics(repo.topics);
  }
  
  // If no tech from topics, use languages
  if (technologies.length === 0 && languages.length > 0) {
    technologies = extractTechnologiesFromLanguages(languages);
  }
  
  // Ensure we don't exceed 5 technologies
  technologies = technologies.slice(0, 5);

  // Determine status
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const lastUpdate = new Date(repo.updatedAt);

  let status: string;
  if (repo.archived) {
    status = 'Archived';
  } else if (lastUpdate > sixMonthsAgo) {
    status = 'Active';
  } else {
    status = 'Maintenance';
  }

  return {
    title,
    description,
    role: 'Developer',
    technologies,
    status
  };
}

// Create AllProject from repo data
export function transformToAllProject(
  repo: RepoData,
  stats: RepoStats,
  readme: string,
  license: LicenseData | null,
  platform: PlatformInfo,
  isCurated: boolean,
  markdown?: ParsedMarkdown
): AllProject {
  const defaults = generateSmartDefaults(repo, readme, stats.languages);
  
  // If curated, use markdown data; otherwise use defaults
  const projectData = markdown ? {
    title: markdown.frontmatter.title,
    description: cleanDescription(markdown.description),
    role: markdown.frontmatter.role,
    technologies: markdown.frontmatter.technologies.slice(0, 5),
    status: markdown.frontmatter.status,
    liveUrl: markdown.frontmatter.liveUrl,
    content: markdown.content // Include content for curated projects
  } : {
    title: defaults.title,
    description: defaults.description,
    role: defaults.role,
    technologies: defaults.technologies,
    status: defaults.status,
    liveUrl: repo.homepage || undefined
  };

  return {
    ...projectData,
    portfolioUrl: `/projects/${repo.name}`,
    repoUrl: repo.htmlUrl,
    readme,
    license,
    stats,
    platform,
    isCurated,
    topics: repo.topics,
    isPrivate: repo.private,
    hasWiki: repo.hasWiki,
    hasPages: repo.hasPages
  };
}

// Create CuratedProject from markdown + repo data
export function transformToCuratedProject(
  markdown: ParsedMarkdown,
  repo: RepoData | null,
  stats: RepoStats | null,
  readme: string,
  license: LicenseData | null,
  platform: PlatformInfo
): CuratedProject {
  // Generate a slug from title for projects without repos
  const projectSlug = repo?.name || markdown.frontmatter.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

  // Default stats for projects without repos
  const defaultStats: RepoStats = {
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    size: 0,
    language: 'Unknown',
    languages: []
  };

  return {
    title: markdown.frontmatter.title,
    portfolioUrl: `/projects/${projectSlug}`,
    repoUrl: markdown.frontmatter.repoUrl,
    liveUrl: markdown.frontmatter.liveUrl,
    description: markdown.description,
    role: markdown.frontmatter.role,
    technologies: markdown.frontmatter.technologies.slice(0, 5),
    status: markdown.frontmatter.status,
    content: markdown.content,
    readme,
    license,
    stats: stats || defaultStats,
    platform
  };
}