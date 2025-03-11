import { Octokit } from '@octokit/rest';
import type { Repository } from '@octokit/webhooks-types';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getLanguageColor } from './colors';

// Define types for our portfolio system (copied from your existing code)
interface Language {
	name: string;
	bytes: number;
	percentage: number;
	color: string;
}

interface PortfolioProject {
	id: string;
	title: string;
	description: string;
	mainContent: string;
	repoUrl: string;
	createdAt: string | number;
	updatedAt: string;
	languages: Language[];
	primaryLanguage: Language | null;
	stars: number;
	forks: number;
}

interface RawProjectData {
	repo: Repository;
	siteMarkdown: string;
	languages: Record<string, number>;
}

// Read environment variables
const GITHUB_TOKEN = process.env.GH_TOKEN || '';
const GITHUB_USERNAME = process.env.GH_USERNAME || '';

if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
	console.error('Missing required environment variables: GH_TOKEN or GH_USERNAME');
	process.exit(1);
}

// Initialize GitHub client
const octokit = new Octokit({
	auth: GITHUB_TOKEN
});

/**
 * Parse the site.md file content according to our format
 */
function parseSiteMarkdown(content: string): { title: string; description: string; mainContent: string; overwriteUrl?: string } {
	try {
		// Extract frontmatter and sections
		const [frontmatter, ...sections] = content.split('---');

		// Parse frontmatter
		const titleMatch = frontmatter.match(/title:\s*(.+)/);
		const urlMatch = frontmatter.match(/overwrite_url:\s*(.+)/);

		const title = titleMatch ? titleMatch[1].trim() : 'Untitled Project';
		const overwriteUrl = urlMatch ? urlMatch[1].trim() : undefined;

		// Join sections back and parse description and main content
		const bodyContent = sections.join('---');

		const descriptionMatch = bodyContent.match(/#description\s*([\s\S]*?)(?=#main|$)/);
		const mainMatch = bodyContent.match(/#main\s*([\s\S]*?)(?=$)/);

		const description = descriptionMatch ? descriptionMatch[1].trim() : '';
		const mainContent = mainMatch ? mainMatch[1].trim() : '';

		return {
			title,
			description,
			mainContent,
			overwriteUrl
		};
	} catch (error) {
		console.error('Error parsing site.md:', error);
		return {
			title: 'Error Parsing Project',
			description: 'There was an error parsing this project\'s metadata.',
			mainContent: ''
		};
	}
}

/**
 * Transform raw GitHub data into our portfolio project format
 */
function transformProjectData(data: RawProjectData): PortfolioProject {
	const parsedContent = parseSiteMarkdown(data.siteMarkdown);

	// sort languages by bytes
	const sortedLanguages = Object.entries(data.languages)
		.sort((a, b) => b[1] - a[1]);

	const parsedLanguages = Object.entries(sortedLanguages).map(([_, [name, bytes]]) => {
		return {
			name,
			bytes,
			percentage: 0,
			color: getLanguageColor(name) || '#333'
		}
	});

	// Calculate percentage for each language
	const totalBytes = parsedLanguages.reduce((total, lang) => total + lang.bytes, 0);
	parsedLanguages.forEach(lang => {
		lang.percentage = (lang.bytes / totalBytes) * 100;
	});

	// Get primary language (the one with most bytes)
	const primaryLanguage = parsedLanguages[0] || null;

	return {
		id: data.repo.id.toString(),
		title: parsedContent.title,
		description: parsedContent.description,
		mainContent: parsedContent.mainContent,
		repoUrl: parsedContent.overwriteUrl || data.repo.html_url,
		createdAt: data.repo.created_at,
		updatedAt: data.repo.updated_at,
		languages: parsedLanguages,
		primaryLanguage,
		stars: data.repo.stargazers_count,
		forks: data.repo.forks_count
	};
}

/**
 * Check if a repository has a site.md file
 */
async function hasSiteMarkdown(owner: string, repo: string): Promise<string | null> {
	try {
		const response = await octokit.repos.getContent({
			owner,
			repo,
			path: 'site.md'
		});

		// If we get here, the file exists
		if ('content' in response.data && 'encoding' in response.data) {
			// Decode base64 content
			return Buffer.from(response.data.content, 'base64').toString('utf-8');
		}

		return null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		// Handle 404 quietly - this is expected for repos without site.md
		if (error?.response?.status === 404) {
			return null;
		}

		// Log other errors
		console.error(`Error checking site.md in repo ${repo}:`, error);
		return null;
	}
}

/**
 * Fetch languages for a repository
 */
async function fetchRepoLanguages(owner: string, repo: string): Promise<Record<string, number>> {
	try {
		const response = await octokit.repos.listLanguages({
			owner,
			repo
		});

		return response.data;
	} catch (error) {
		console.error(`Error fetching languages for ${owner}/${repo}:`, error);
		return {};
	}
}

/**
 * Main function to fetch all repos and generate portfolio data
 */
async function fetchPortfolioData(): Promise<PortfolioProject[]> {
	const portfolioProjects: PortfolioProject[] = [];
	let page = 1;
	let hasMoreRepos = true;

	console.log(`Starting portfolio data fetch for ${GITHUB_USERNAME}`);

	try {
		while (hasMoreRepos) {
			const reposResponse = await octokit.repos.listForUser({
				username: GITHUB_USERNAME,
				type: 'owner',
				sort: 'updated',
				per_page: 10,
				page: page
			});

			const repos = reposResponse.data as Repository[];

			if (repos.length === 0) {
				hasMoreRepos = false;
				break;
			}

			console.log(`Processing batch ${page} with ${repos.length} repos`);

			for (const repo of repos) {
				const siteMarkdown = await hasSiteMarkdown(GITHUB_USERNAME, repo.name);

				if (siteMarkdown) {
					const languages = await fetchRepoLanguages(GITHUB_USERNAME, repo.name);

					const projectData: RawProjectData = {
						repo,
						siteMarkdown,
						languages
					};

					portfolioProjects.push(transformProjectData(projectData));
				}
			}

			page++;
		}

		// Sort by updated date (newest first)
		portfolioProjects.sort((a, b) => {
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		});

		console.log(`Completed fetch with ${portfolioProjects.length} projects`);

		return portfolioProjects;
	} catch (error) {
		console.error('Error fetching portfolio data:', error);
		throw error;
	}
}

/**
 * Save the portfolio data to a JSON file
 */
async function savePortfolioData(data: PortfolioProject[], filePath: string): Promise<void> {
	try {
		// Create the directory if it doesn't exist
		await mkdir(dirname(filePath), { recursive: true });

		// Write the JSON file
		await writeFile(filePath, JSON.stringify(data, null, 2));

		console.log(`Successfully wrote portfolio data to ${filePath}`);
	} catch (error) {
		console.error(`Error writing portfolio data to ${filePath}:`, error);
		throw error;
	}
}

/**
 * Main execution function
 */
async function main() {
	try {
		console.log('Starting portfolio data fetch and save process');

		// Fetch all portfolio projects
		const portfolioData = await fetchPortfolioData();

		// Save to a JSON file
		await savePortfolioData(portfolioData, 'public/data/portfolio-projects.json');

		console.log('Portfolio data update completed successfully');
	} catch (error) {
		console.error('Error in portfolio data update process:', error);
		process.exit(1);
	}
}

// Run the main function
main();