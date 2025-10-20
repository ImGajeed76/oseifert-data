import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadSiteMarkdownFiles } from './fetchers/site-markdown';
import { fetchProfileStats } from './fetchers/profile-stats';
import { createPlatformClient, GitHubClient } from './fetchers/git-platforms';
import { parseGitUrl } from './parsers/url-parser';
import { 
  transformRepoStats, 
  transformToAllProject, 
  transformToCuratedProject 
} from './parsers/project-transformer';
import type { CuratedProject, AllProject, ProfileStats } from './types';

// Environment variables
const GITHUB_TOKEN = process.env.GH_TOKEN || '';
const GITHUB_USERNAME = process.env.GH_USERNAME || '';
const PRIMARY_PLATFORM = process.env.PRIMARY_PLATFORM || 'github';

if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
  console.error('Missing required environment variables: GH_TOKEN or GH_USERNAME');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting portfolio data fetch...\n');

  // 1. Load markdown files
  console.log('📄 Loading curated project markdown files...');
  const markdownFiles = await loadSiteMarkdownFiles('data/site');
  console.log(`✓ Loaded ${markdownFiles.length} markdown files\n`);

  // 2. Initialize primary platform client
  console.log('🔌 Initializing platform clients...');
  const primaryClient = new GitHubClient(GITHUB_TOKEN);
  console.log(`✓ Connected to ${PRIMARY_PLATFORM}\n`);

  // 3. Fetch all repos from primary platform
  console.log(`📦 Fetching all repositories from ${PRIMARY_PLATFORM}...`);
  const allRepos = await primaryClient.listRepos(GITHUB_USERNAME);
  console.log(`✓ Found ${allRepos.length} repositories\n`);

  // 4. Process curated projects
  console.log('⭐ Processing curated projects...');
  const curatedProjects: CuratedProject[] = [];
  const curatedRepoUrls = new Set<string>();

  for (const { filename, parsed } of markdownFiles) {
    try {
      console.log(`  Processing ${filename}...`);
      
      // Parse repo URL
      const platformInfo = parseGitUrl(parsed.frontmatter.repoUrl);
      if (!platformInfo) {
        console.error(`  ✗ Invalid repo URL in ${filename}`);
        continue;
      }

      curatedRepoUrls.add(parsed.frontmatter.repoUrl);

      // Create platform client
      const client = createPlatformClient(platformInfo, GITHUB_TOKEN);

      // Fetch repo data
      const repo = await client.getRepo(platformInfo.owner, platformInfo.repo);
      const languages = await client.getLanguages(platformInfo.owner, platformInfo.repo);
      const readme = await client.getReadme(platformInfo.owner, platformInfo.repo);
      const license = await client.getLicense(platformInfo.owner, platformInfo.repo);

      // Transform to stats
      const stats = transformRepoStats(repo, languages);

      // Create curated project
      const project = transformToCuratedProject(
        parsed,
        repo,
        stats,
        readme,
        license,
        {
          type: platformInfo.type,
          url: parsed.frontmatter.repoUrl,
          apiAvailable: platformInfo.apiSupported
        }
      );

      curatedProjects.push(project);
      console.log(`  ✓ ${project.title}`);
    } catch (error) {
      console.error(`  ✗ Failed to process ${filename}:`, error);
    }
  }

  // Sort by lastUpdated (descending)
  curatedProjects.sort((a, b) => 
    new Date(b.stats.lastUpdated).getTime() - new Date(a.stats.lastUpdated).getTime()
  );

  console.log(`✓ Processed ${curatedProjects.length} curated projects\n`);

  // 5. Process all repos
  console.log('📚 Processing all repositories...');
  const allProjects: AllProject[] = [];

  for (const [index, repo] of allRepos.entries()) {
    try {
      if (index % 10 === 0 && index > 0) {
        console.log(`  Processed ${index}/${allRepos.length} repositories...`);
      }
      
      const isCurated = curatedRepoUrls.has(repo.htmlUrl);
      
      // Fetch additional data in parallel for better performance
      const [languages, readme, license] = await Promise.all([
        primaryClient.getLanguages(GITHUB_USERNAME, repo.name),
        primaryClient.getReadme(GITHUB_USERNAME, repo.name),
        primaryClient.getLicense(GITHUB_USERNAME, repo.name)
      ]);

      // Transform to stats
      const stats = transformRepoStats(repo, languages);

      // Get markdown if curated
      const markdown = isCurated 
        ? markdownFiles.find(mf => mf.parsed.frontmatter.repoUrl === repo.htmlUrl)?.parsed
        : undefined;

      // Create project
      const project = transformToAllProject(
        repo,
        stats,
        readme,
        license,
        {
          type: PRIMARY_PLATFORM,
          url: repo.htmlUrl,
          apiAvailable: true
        },
        isCurated,
        markdown
      );

      allProjects.push(project);
    } catch (error) {
      console.error(`  ✗ Failed to process ${repo.name}:`, error);
    }
  }

  // Sort by lastUpdated (descending)
  allProjects.sort((a, b) => 
    new Date(b.stats.lastUpdated).getTime() - new Date(a.stats.lastUpdated).getTime()
  );

  console.log(`✓ Processed ${allProjects.length} total projects\n`);

  // 6. Fetch profile stats
  console.log('📊 Fetching profile statistics...');
  const clients = new Map([['github', primaryClient]]);
  const profileStats = await fetchProfileStats(clients, GITHUB_USERNAME, allProjects);
  console.log('✓ Profile statistics generated\n');

  // 7. Save outputs
  console.log('💾 Saving output files...');
  await saveJson('public/data/curated-projects.json', curatedProjects);
  await saveJson('public/data/all-projects.json', allProjects);
  await saveJson('public/data/profile-stats.json', profileStats);
  console.log('✓ All files saved\n');

  console.log('✅ Portfolio data fetch completed successfully!');
  console.log(`📊 Summary:`);
  console.log(`   • ${curatedProjects.length} curated projects`);
  console.log(`   • ${allProjects.length} total projects`);
  console.log(`   • ${allProjects.filter(p => p.isCurated).length} curated repos in all projects`);
  console.log(`   • ${allProjects.filter(p => !p.isCurated).length} auto-generated repos`);
}

async function saveJson(filepath: string, data: any): Promise<void> {
  await mkdir(dirname(filepath), { recursive: true });
  await writeFile(filepath, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filepath}`);
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});