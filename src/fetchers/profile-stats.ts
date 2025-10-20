import type { ProfileStats, AggregatedStats, AllProject, PlatformProfile } from '../types';
import { GitPlatformClient } from './git-platforms/base';

export async function fetchProfileStats(
  clients: Map<string, GitPlatformClient>,
  username: string,
  allProjects: AllProject[]
): Promise<ProfileStats> {
  const platforms: Record<string, PlatformProfile> = {};

  // Fetch profile from each platform
  for (const [platformName, client] of clients.entries()) {
    try {
      const profile = await client.getUser(username);
      platforms[platformName] = profile;
      console.log(`✓ Fetched ${platformName} profile`);
    } catch (error) {
      console.error(`✗ Failed to fetch ${platformName} profile:`, error);
    }
  }

  // Aggregate statistics from all projects
  const aggregated = aggregateStats(allProjects);

  return {
    platforms,
    aggregated,
    fetchedAt: new Date().toISOString()
  };
}

function aggregateStats(projects: AllProject[]): AggregatedStats {
  const totalRepos = projects.length;
  const totalStars = projects.reduce((sum, p) => sum + p.stats.stars, 0);
  const totalForks = projects.reduce((sum, p) => sum + p.stats.forks, 0);

  // Language breakdown
  const languageBreakdown: Record<string, {bytes: number; repos: number}> = {};
  projects.forEach(project => {
    project.stats.languages.forEach(lang => {
      if (!languageBreakdown[lang.name]) {
        languageBreakdown[lang.name] = { bytes: 0, repos: 0 };
      }
      languageBreakdown[lang.name].bytes += lang.bytes;
    });
    
    // Count unique repos per language
    const projectLanguages = new Set(project.stats.languages.map(l => l.name));
    projectLanguages.forEach(lang => {
      if (languageBreakdown[lang]) {
        languageBreakdown[lang].repos += 1;
      }
    });
  });

  // Most used languages
  const totalBytes = Object.values(languageBreakdown).reduce((sum, l) => sum + l.bytes, 0);
  const mostUsedLanguages = Object.entries(languageBreakdown)
    .map(([language, data]) => ({
      language,
      repoCount: data.repos,
      totalBytes: data.bytes,
      percentage: totalBytes > 0 ? (data.bytes / totalBytes) * 100 : 0
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .slice(0, 10);

  // Top repositories
  const topRepositories = projects
    .sort((a, b) => b.stats.stars - a.stats.stars)
    .slice(0, 10)
    .map(p => ({
      name: p.title,
      platform: p.platform.type,
      stars: p.stats.stars,
      forks: p.stats.forks,
      url: p.repoUrl || ''
    }));

  // License breakdown
  const licenseBreakdown: Record<string, number> = {};
  projects.forEach(project => {
    const licenseName = project.license?.name || 'None';
    licenseBreakdown[licenseName] = (licenseBreakdown[licenseName] || 0) + 1;
  });

  return {
    totalRepos,
    totalStars,
    totalForks,
    languageBreakdown,
    mostUsedLanguages,
    topRepositories,
    licenseBreakdown
  };
}