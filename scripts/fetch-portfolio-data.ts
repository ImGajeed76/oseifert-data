import { Octokit } from '@octokit/rest';
import type { Endpoints } from '@octokit/types';
import type { Repository } from '@octokit/webhooks-types';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getLanguageColor } from './colors';

// Define a type for the response of octokit.repos.get - adapt if needed based on your Octokit version
type GetRepoResponseData =
	Endpoints['GET /repos/{owner}/{repo}']['response']['data'];

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
	repo: GetRepoResponseData; // Use the detailed repo type
	siteMarkdown: string;
	languages: Record<string, number>;
	parsedMarkdown: ParsedMarkdown; // Include parsed markdown for easier access
}

interface ParsedMarkdown {
	title: string;
	description: string;
	mainContent: string;
	overwriteUrl?: string;
}

// Read environment variables
const GITHUB_TOKEN = process.env.GH_TOKEN || '';
const GITHUB_USERNAME = process.env.GH_USERNAME || '';

if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
	console.error(
		'Missing required environment variables: GH_TOKEN or GH_USERNAME'
	);
	process.exit(1);
}

// Initialize GitHub client
const octokit = new Octokit({
	auth: GITHUB_TOKEN
});

/**
 * Parse the site.md file content according to our format
 */
function parseSiteMarkdown(content: string): ParsedMarkdown {
	try {
		// Extract frontmatter and sections
		const parts = content.split('---');
		if (parts.length < 2) {
			// Handle case with no frontmatter or invalid structure
			console.warn('Invalid site.md format: Missing frontmatter separator');
			// Attempt to parse body assuming no frontmatter
			const bodyContent = content;
			const descriptionMatch = bodyContent.match(
				/#description\s*([\s\S]*?)(?=#main|$)/
			);
			const mainMatch = bodyContent.match(/#main\s*([\s\S]*?)(?=$)/);
			const description = descriptionMatch ? descriptionMatch[1].trim() : '';
			const mainContent = mainMatch ? mainMatch[1].trim() : '';
			return {
				title: 'Untitled Project (Parsing Error)',
				description,
				mainContent,
				overwriteUrl: undefined
			};
		}

		const [_, frontmatter, ...sections] = parts; // Get content after first '---'

		// Parse frontmatter
		const titleMatch = frontmatter.match(/title:\s*(.+)/);
		const urlMatch = frontmatter.match(/overwrite_url:\s*(.+)/);

		const title = titleMatch ? titleMatch[1].trim() : 'Untitled Project';
		const overwriteUrl = urlMatch ? urlMatch[1].trim() : undefined;

		// Join sections back and parse description and main content
		const bodyContent = sections.join('---');

		const descriptionMatch = bodyContent.match(
			/#description\s*([\s\S]*?)(?=#main|$)/
		);
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
			description: "There was an error parsing this project's metadata.",
			mainContent: '',
			overwriteUrl: undefined
		};
	}
}

/**
 * Parses a GitHub URL and extracts owner and repo.
 * Returns null if the URL is not a valid GitHub repository URL.
 */
function parseGitHubUrl(
	url: string
): { owner: string; repo: string } | null {
	try {
		const parsedUrl = new URL(url);
		if (parsedUrl.hostname !== 'github.com') {
			return null;
		}
		const pathParts = parsedUrl.pathname.split('/').filter(Boolean); // Filter out empty strings
		if (pathParts.length >= 2) {
			// Allow for trailing parts like /tree/main, /issues etc.
			const [owner, repo] = pathParts;
			// Basic validation for owner/repo names
			if (owner && repo && /^[a-zA-Z0-9-]+$/i.test(owner) && /^[a-zA-Z0-9_.-]+$/i.test(repo)) {
				return { owner, repo };
			}
		}
		return null;
	} catch (error) {
		// Handle invalid URLs
		console.warn(`Could not parse URL: ${url}`, error);
		return null;
	}
}

/**
 * Transform raw GitHub data into our portfolio project format
 */
function transformProjectData(data: RawProjectData): PortfolioProject {
	const { repo, languages, parsedMarkdown } = data;

	// Sort languages by bytes
	const sortedLanguages = Object.entries(languages).sort(
		(a, b) => b[1] - a[1]
	);

	const parsedLanguages: Language[] = sortedLanguages.map(([name, bytes]) => {
		return {
			name,
			bytes,
			percentage: 0, // Will be calculated next
			color: getLanguageColor(name) || '#333'
		};
	});

	// Calculate percentage for each language
	const totalBytes = parsedLanguages.reduce((total, lang) => total + lang.bytes, 0);
	if (totalBytes > 0) {
		parsedLanguages.forEach(lang => {
			lang.percentage = (lang.bytes / totalBytes) * 100;
		});
	}

	// Get primary language (the one with most bytes)
	const primaryLanguage = parsedLanguages[0] || null;

	// Use overwriteUrl if it exists, otherwise use the repo's html_url
	const finalRepoUrl = parsedMarkdown.overwriteUrl || repo.html_url;

	return {
		id: repo.id.toString(), // Use ID from the fetched repo (original or overwritten)
		title: parsedMarkdown.title,
		description: parsedMarkdown.description,
		mainContent: parsedMarkdown.mainContent,
		repoUrl: finalRepoUrl,
		createdAt: repo.created_at, // Use date from the fetched repo
		updatedAt: repo.updated_at, // Use date from the fetched repo
		languages: parsedLanguages,
		primaryLanguage,
		stars: repo.stargazers_count, // Use stars from the fetched repo
		forks: repo.forks_count // Use forks from the fetched repo
	};
}

/**
 * Check if a repository has a site.md file and return its content
 */
async function getSiteMarkdownContent(
	owner: string,
	repo: string
): Promise<string | null> {
	try {
		const response = await octokit.repos.getContent({
			owner,
			repo,
			path: 'site.md'
		});

		// Check if the response data is an object and has content/encoding properties
		if (
			typeof response.data === 'object' &&
			response.data !== null &&
			'content' in response.data &&
			'encoding' in response.data &&
			response.data.encoding === 'base64' // Ensure it's base64 encoded
		) {
			// Decode base64 content
			return Buffer.from(response.data.content, 'base64').toString('utf-8');
		} else {
			console.warn(`Received unexpected content format for site.md in ${owner}/${repo}`);
			return null; // Or handle other content types if necessary
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		// Handle 404 quietly - this is expected for repos without site.md
		if (error?.status === 404) {
			return null;
		}

		// Log other errors
		console.error(`Error checking site.md in repo ${owner}/${repo}:`, error);
		return null;
	}
}

/**
 * Fetch languages for a repository
 */
async function fetchRepoLanguages(
	owner: string,
	repo: string
): Promise<Record<string, number>> {
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
 * Fetch detailed repository data
 */
async function fetchRepoDetails(
	owner: string,
	repo: string
): Promise<GetRepoResponseData | null> {
	try {
		const response = await octokit.repos.get({
			owner,
			repo
		});
		return response.data;
	} catch (error) {
		console.error(`Error fetching repository details for ${owner}/${repo}:`, error);
		return null;
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
				type: 'owner', // Fetch only repos owned by the user
				sort: 'updated',
				per_page: 10, // Adjust per_page as needed
				page: page
			});

			// Use the correct type from webhooks-types for the list response
			const repos = reposResponse.data as Repository[];

			if (repos.length === 0) {
				hasMoreRepos = false;
				break;
			}

			console.log(`Processing batch ${page} with ${repos.length} repos`);

			for (const originalRepo of repos) {
				const siteMarkdown = await getSiteMarkdownContent(
					GITHUB_USERNAME,
					originalRepo.name
				);

				if (siteMarkdown) {
					const parsedMarkdown = parseSiteMarkdown(siteMarkdown);
					let targetRepoData: GetRepoResponseData | null = null;
					let targetLanguages: Record<string, number> = {};
					let targetOwner = GITHUB_USERNAME;
					let targetRepoName = originalRepo.name;

					const overwriteInfo = parsedMarkdown.overwriteUrl
						? parseGitHubUrl(parsedMarkdown.overwriteUrl)
						: null;

					if (overwriteInfo) {
						// Overwrite URL is specified and is a valid GitHub URL
						console.log(
							`Found overwrite_url for ${originalRepo.name}: ${parsedMarkdown.overwriteUrl}. Fetching data from ${overwriteInfo.owner}/${overwriteInfo.repo}`
						);
						targetOwner = overwriteInfo.owner;
						targetRepoName = overwriteInfo.repo;
						targetRepoData = await fetchRepoDetails(
							targetOwner,
							targetRepoName
						);
						if (!targetRepoData) {
							console.warn(
								`Skipping project ${originalRepo.name} because fetching overwritten repo ${targetOwner}/${targetRepoName} failed.`
							);
							continue; // Skip this project if fetching overwritten repo fails
						}
					} else {
						// No valid overwrite URL, use the original repo data
						// We need the detailed data, so fetch it using repos.get
						// Alternatively, cast originalRepo if its structure matches GetRepoResponseData sufficiently
						// For safety and completeness, let's fetch details.
						targetRepoData = await fetchRepoDetails(
							targetOwner,
							targetRepoName
						);
						if (!targetRepoData) {
							console.warn(
								`Skipping project ${originalRepo.name} because fetching its own details failed.`
							);
							continue; // Skip if fetching original repo details fails
						}
						if (parsedMarkdown.overwriteUrl) {
							console.warn(
								`Overwrite URL "${parsedMarkdown.overwriteUrl}" for repo ${originalRepo.name} is not a valid GitHub repo URL. Using original repo data.`
							);
						}
					}

					// Fetch languages for the target repo (original or overwritten)
					targetLanguages = await fetchRepoLanguages(
						targetOwner,
						targetRepoName
					);

					const projectData: RawProjectData = {
						repo: targetRepoData, // This is now GetRepoResponseData
						siteMarkdown,
						languages: targetLanguages,
						parsedMarkdown // Pass parsed markdown for transform function
					};

					portfolioProjects.push(transformProjectData(projectData));
				}
			}

			page++;
		}

		// Sort by updated date (newest first) using data from the *target* repo
		portfolioProjects.sort((a, b) => {
			// Ensure updatedAt is treated as a date string
			const dateA = new Date(a.updatedAt).getTime();
			const dateB = new Date(b.updatedAt).getTime();
			return dateB - dateA;
		});

		console.log(`Completed fetch with ${portfolioProjects.length} projects`);

		return portfolioProjects;
	} catch (error) {
		console.error('Error fetching portfolio data:', error);
		throw error; // Rethrow to be caught by main
	}
}

/**
 * Save the portfolio data to a JSON file
 */
async function savePortfolioData(
	data: PortfolioProject[],
	filePath: string
): Promise<void> {
	try {
		// Create the directory if it doesn't exist
		await mkdir(dirname(filePath), { recursive: true });

		// Write the JSON file
		await writeFile(filePath, JSON.stringify(data, null, 2));

		console.log(`Successfully wrote portfolio data to ${filePath}`);
	} catch (error) {
		console.error(`Error writing portfolio data to ${filePath}:`, error);
		throw error; // Rethrow to be caught by main
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
		await savePortfolioData(
			portfolioData,
			'public/data/portfolio-projects.json'
		);

		console.log('Portfolio data update completed successfully');
	} catch (error) {
		console.error('Error in portfolio data update process:', error);
		process.exit(1);
	}
}

// Run the main function
main();