import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GitHubClient } from './platforms/github.ts';
import { GitLabClient } from './platforms/gitlab.ts';
import { GiteaClient } from './platforms/gitea.ts';
import { deriveRole, processLanguages, generateSlug } from './platforms/base.ts';
import type { PlatformClient } from './platforms/base.ts';
import { getLanguageColor } from './utils/colors.ts';
import { loadBlogPosts } from './blog-parser.ts';
import { fetchDevToArticles } from './devto.ts';
import type { Project, BlogPost, RawRepo } from './types.ts';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const BLOG_DIR = join(ROOT_DIR, 'data', 'blog');
const OUTPUT_DIR = join(ROOT_DIR, 'public', 'data');

// --- Configuration from environment ---

function buildClients(): PlatformClient[] {
	const clients: PlatformClient[] = [];

	// GitHub (primary)
	const ghToken = process.env.GH_TOKEN;
	const ghUsername = process.env.GH_USERNAME;
	if (ghToken && ghUsername) {
		clients.push(new GitHubClient(ghToken, ghUsername));
	}

	// GitLab (optional)
	const glToken = process.env.GL_TOKEN;
	const glUsername = process.env.GL_USERNAME;
	if (glToken && glUsername) {
		const glUrl = process.env.GL_URL || 'https://gitlab.com';
		clients.push(new GitLabClient(glToken, glUsername, glUrl));
	}

	// Gitea/Codeberg (optional)
	const gtToken = process.env.GT_TOKEN;
	const gtUsername = process.env.GT_USERNAME;
	const gtUrl = process.env.GT_URL;
	if (gtToken && gtUsername && gtUrl) {
		const platform = gtUrl.includes('codeberg.org') ? 'codeberg' : 'gitea';
		clients.push(new GiteaClient(gtToken, gtUsername, gtUrl, platform as 'gitea' | 'codeberg'));
	}

	return clients;
}

// --- Pipeline ---

interface RepoWithPlatform extends RawRepo {
	_platform: string;
	_client: PlatformClient;
}

async function fetchAllRepos(clients: PlatformClient[]): Promise<RepoWithPlatform[]> {
	const allRepos: RepoWithPlatform[] = [];

	for (const client of clients) {
		console.log(`Fetching repos from ${client.platform} (${client.username})...`);
		try {
			const repos = await client.fetchRepos();
			console.log(`  Found ${repos.length} public repos`);

			for (const repo of repos) {
				allRepos.push({ ...repo, _platform: client.platform, _client: client });
			}
		} catch (err) {
			console.error(`  ERROR: Failed to fetch from ${client.platform} (${client.username}):`, err);
			console.error(`  Skipping this platform and continuing...`);
		}
	}

	return allRepos;
}

async function enrichRepo(
	repo: RepoWithPlatform,
	slug: string,
	blogPosts: BlogPost[]
): Promise<Project> {
	const [rawLangs, readme, roleName] = await Promise.all([
		repo._client.fetchLanguages(repo.owner.login, repo.name),
		repo._client.fetchReadme(repo.owner.login, repo.name),
		repo._client.fetchPermission(repo.owner.login, repo.name),
	]);

	const languages = processLanguages(rawLangs, getLanguageColor);
	const role = deriveRole(repo.owner.login, repo.owner.type, repo._client.username, roleName);

	// Cross-reference: explicit (frontmatter projects field) + auto (scan content for repo URLs)
	const repoUrl = repo.html_url.toLowerCase();
	const linkedBlogPosts = blogPosts
		.filter((post) => {
			// Explicit: declared in frontmatter
			if (post.projects.includes(slug)) return true;
			// Auto: scan content for GitHub repo URL
			if (post.content && post.content.toLowerCase().includes(repoUrl)) return true;
			return false;
		})
		.map((post) => post.slug);

	return {
		slug,
		title: repo.name,
		description: repo.description || '',
		url: repo.html_url,
		homepage: repo.homepage || null,
		stars: repo.stargazers_count,
		forks: repo.forks_count,
		license: repo.license?.spdx_id || null,
		createdAt: repo.created_at,
		updatedAt: repo.pushed_at,
		topics: repo.topics,
		languages,
		primaryLanguage: languages[0]?.name || '',
		owner: repo.owner.login,
		role,
		readme,
		linkedBlogPosts,
	};
}

async function main() {
	console.log('=== oseifert-data fetcher ===\n');

	// 1. Build platform clients
	const clients = buildClients();
	if (clients.length === 0) {
		console.error('No platform credentials configured. Set GH_TOKEN + GH_USERNAME at minimum.');
		process.exit(1);
	}

	// 2. Load blog posts (local markdown + dev.to)
	console.log('Loading blog posts...');
	const localPosts = await loadBlogPosts(BLOG_DIR);
	console.log(`  Found ${localPosts.length} local blog posts`);

	const devtoUsername = process.env.DEVTO_USERNAME || process.env.GH_USERNAME;
	let devtoPosts: BlogPost[] = [];
	if (devtoUsername) {
		console.log(`  Fetching dev.to articles for ${devtoUsername}...`);
		devtoPosts = await fetchDevToArticles(devtoUsername);
		console.log(`  Found ${devtoPosts.length} dev.to articles`);
	}

	const blogPosts = [...localPosts, ...devtoPosts];
	console.log(`  Total: ${blogPosts.length} blog posts\n`);

	// 3. Fetch all repos from all platforms
	const allRepos = await fetchAllRepos(clients);
	console.log(`\nTotal repos across all platforms: ${allRepos.length}\n`);

	// 4. Generate slugs (deterministic: kebab-name + first 4 chars of repo ID)
	const slugs = allRepos.map((r) => generateSlug(r.name, r.id));

	// Sanity check: slugs should be unique (guaranteed by ID suffix, but verify)
	const slugSet = new Set(slugs);
	if (slugSet.size !== slugs.length) {
		console.error('ERROR: Duplicate slugs detected (should not happen):');
		const seen = new Map<string, string>();
		for (let i = 0; i < slugs.length; i++) {
			if (seen.has(slugs[i])) {
				console.error(`  "${slugs[i]}" from "${allRepos[i].full_name}" collides with "${seen.get(slugs[i])}"`);
			}
			seen.set(slugs[i], allRepos[i].full_name);
		}
		process.exit(1);
	}

	// 5. Validate: no blog post slug collides with a project slug
	const blogSlugCollisions = blogPosts.filter((p) => slugSet.has(p.slug));
	if (blogSlugCollisions.length > 0) {
		console.error('ERROR: Blog post slugs collide with project slugs:');
		for (const post of blogSlugCollisions) {
			console.error(`  - blog "${post.title}" has slug "${post.slug}" which matches a project`);
		}
		process.exit(1);
	}

	// 6. Enrich repos (fetch languages + readme in parallel, batched)
	console.log('Enriching repos (languages + readme)...');
	const BATCH_SIZE = 5;
	const projects: Project[] = [];

	for (let i = 0; i < allRepos.length; i += BATCH_SIZE) {
		const batch = allRepos.slice(i, i + BATCH_SIZE);
		const enriched = await Promise.all(
			batch.map((repo, batchIdx) => {
				const slug = slugs[i + batchIdx];
				return enrichRepo(repo, slug, blogPosts);
			})
		);
		projects.push(...enriched);
		const progress = `  ${Math.min(i + BATCH_SIZE, allRepos.length)}/${allRepos.length}`;
		if (process.stdout.isTTY) {
			process.stdout.write(`${progress}\r`);
		}
	}
	if (process.stdout.isTTY) console.log('');

	// 7. Filter out projects without a README
	const projectsWithReadme = projects.filter((p) => p.readme.trim().length > 0);
	console.log(`Filtered: ${projects.length - projectsWithReadme.length} repos without README removed`);

	// 8. Sort projects by stars descending (consistent output order)
	projectsWithReadme.sort((a, b) => b.stars - a.stars);

	// 9. Write output
	await mkdir(OUTPUT_DIR, { recursive: true });

	await writeFile(
		join(OUTPUT_DIR, 'projects.json'),
		JSON.stringify(projectsWithReadme, null, 2)
	);
	console.log(`Wrote ${projectsWithReadme.length} projects to projects.json`);

	// Filter drafts out of blog output
	const publishedPosts = blogPosts.filter((p) => !p.draft);
	await writeFile(
		join(OUTPUT_DIR, 'blog-posts.json'),
		JSON.stringify(publishedPosts, null, 2)
	);
	console.log(`Wrote ${publishedPosts.length} blog posts to blog-posts.json (${blogPosts.length - publishedPosts.length} drafts excluded)`);

	console.log('\nDone!');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
