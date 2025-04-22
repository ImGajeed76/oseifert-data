import { Octokit } from '@octokit/rest';
import type { Endpoints } from '@octokit/types';
import type { Repository } from '@octokit/webhooks-types';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
// Assuming getLanguageColor is correctly defined elsewhere
// import { getLanguageColor } from './colors';

// Placeholder for getLanguageColor if not imported
function getLanguageColor(language: string): string | undefined {
	const colors: Record<string, string> = {
		TypeScript: '#3178c6',
		JavaScript: '#f1e05a',
		HTML: '#e34c26',
		CSS: '#563d7c',
		Go: '#00ADD8',
		Python: '#3572A5',
		Jinja: '#a52a22',
		Batchfile: '#C1F12E',
		CMake: '#DA3434'
		// Add more languages and colors
	};
	return colors[language];
}

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
	repo: GetRepoResponseData;
	siteMarkdown: string; // Keep original markdown for debugging if needed
	languages: Record<string, number>;
	parsedMarkdown: ParsedMarkdown;
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
 * Parse the site.md file content according to the format:
 * title: ...
 * overwrite_url: ... (optional)
 * ---
 * #description
 * ...
 * #main
 * ...
 */
function parseSiteMarkdown(content: string): ParsedMarkdown {
	try {
		const separator = '---';
		const separatorIndex = content.indexOf(separator);

		let frontmatterContent = '';
		let bodyContent = content; // Default to full content if no separator

		if (separatorIndex !== -1) {
			frontmatterContent = content.substring(0, separatorIndex).trim();
			// Get content *after* the separator
			bodyContent = content.substring(separatorIndex + separator.length).trim();
		} else {
			console.warn(
				'Warning: "---" separator not found in site.md. Attempting to parse without frontmatter.'
			);
			// If no separator, assume no frontmatter, try parsing body directly
		}

		// Parse frontmatter (from the part before ---)
		// Use multiline flag 'm' and start/end anchors '^$' to match lines exactly
		const titleMatch = frontmatterContent.match(/^title:\s*(.+)$/m);
		const urlMatch = frontmatterContent.match(/^overwrite_url:\s*(.+)$/m);

		// Use a default title if not found in frontmatter
		const title = titleMatch ? titleMatch[1].trim() : 'Untitled Project';
		const overwriteUrl = urlMatch ? urlMatch[1].trim() : undefined;

		// Parse description and main content from the body (part after ---)
		// Regex looks for #description, captures everything until #main or end of string
		const descriptionMatch = bodyContent.match(
			/#description\s*([\s\S]*?)(?=#main|$)/
		);
		// Regex looks for #main, captures everything until end of string
		const mainMatch = bodyContent.match(/#main\s*([\s\S]*?)(?=$)/);

		const description = descriptionMatch ? descriptionMatch[1].trim() : '';
		const mainContent = mainMatch ? mainMatch[1].trim() : '';

		// Add a log if parsing seems incomplete based on the input structure
		if (title === 'Untitled Project' && !description && !mainContent && content.length > 0) {
			console.warn(`Potential parsing issue for site.md. Title: ${title}, Desc: ${description ? 'found' : 'not found'}, Main: ${mainContent ? 'found' : 'not found'}. Content starts with:\n${content.substring(0, 150)}...`);
		}
		if (separatorIndex !== -1 && title === 'Untitled Project' && !titleMatch) {
			console.warn(`Warning: Separator "---" found, but 'title:' line missing or malformed in frontmatter.`);
		}


		return {
			title,
			description,
			mainContent,
			overwriteUrl
		};
	} catch (error) {
		console.error('Error parsing site.md:', error);
		// Provide the raw content in case of error for easier debugging
		return {
			title: 'Error Parsing Project',
			description: `There was an error parsing this project's metadata. Raw content:\n${content}`,
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
		// Split pathname, filter out empty strings (e.g., leading/trailing slashes)
		const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
		if (pathParts.length >= 2) {
			const [owner, repo] = pathParts;
			// Basic validation for owner/repo names (allow letters, numbers, hyphen, underscore, dot)
			if (
				owner &&
				repo &&
				/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(owner) && // GitHub username regex
				/^[a-z\d_.-]+$/i.test(repo) // Repo name regex
			) {
				// Remove potential trailing '.git' from repo name
				const cleanRepo = repo.replace(/\.git$/, '');
				return { owner, repo: cleanRepo };
			}
		}
		return null;
	} catch (error) {
		// Handle invalid URLs (e.g., malformed strings)
		console.warn(`Could not parse URL as GitHub repo URL: ${url}`, error);
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
			// Avoid division by zero and ensure percentage is calculated correctly
			lang.percentage = (lang.bytes / totalBytes) * 100;
		});
	}

	// Get primary language (the one with most bytes)
	const primaryLanguage = parsedLanguages[0] || null;

	// Use overwriteUrl if it exists, otherwise use the repo's html_url
	const finalRepoUrl = parsedMarkdown.overwriteUrl || repo.html_url;

	return {
		// Use ID, dates, stars, forks from the *fetched* repo (original or overwritten)
		id: repo.id.toString(),
		title: parsedMarkdown.title, // Use title from parsed markdown
		description: parsedMarkdown.description, // Use description from parsed markdown
		mainContent: parsedMarkdown.mainContent, // Use mainContent from parsed markdown
		repoUrl: finalRepoUrl, // Use overwriteUrl if present, else fetched repo URL
		createdAt: repo.created_at,
		updatedAt: repo.updated_at,
		languages: parsedLanguages, // Use languages from the *fetched* repo
		primaryLanguage,
		stars: repo.stargazers_count,
		forks: repo.forks_count
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
			!Array.isArray(response.data) && // Ensure it's not an array (which happens for directories)
			'content' in response.data &&
			'encoding' in response.data &&
			response.data.encoding === 'base64'
		) {
			// Decode base64 content
			return Buffer.from(response.data.content, 'base64').toString('utf-8');
		} else {
			console.warn(
				`Received unexpected content format or type for site.md in ${owner}/${repo}. Expected file with base64 content.`
			);
			return null;
		}
	} catch (error: any) {
		// Handle 404 quietly - this is expected for repos without site.md
		if (error?.status === 404) {
			// console.log(`No site.md found in ${owner}/${repo}`); // Optional: log missing files
			return null;
		}
		// Log other errors
		console.error(
			`Error fetching site.md content in repo ${owner}/${repo}:`,
			error.message || error
		);
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
	} catch (error: any) {
		console.error(
			`Error fetching languages for ${owner}/${repo}:`,
			error.message || error
		);
		return {}; // Return empty object on error
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
	} catch (error: any) {
		console.error(
			`Error fetching repository details for ${owner}/${repo}:`,
			error.message || error
		);
		return null; // Return null on error
	}
}

/**
 * Main function to fetch all repos and generate portfolio data
 */
async function fetchPortfolioData(): Promise<PortfolioProject[]> {
	const portfolioProjects: PortfolioProject[] = [];
	let page = 1;
	const perPage = 30; // Fetch more per page to reduce API calls
	let hasMoreRepos = true;

	console.log(`Starting portfolio data fetch for user: ${GITHUB_USERNAME}`);

	try {
		while (hasMoreRepos) {
			console.log(`Fetching page ${page} of repositories...`);
			const reposResponse = await octokit.repos.listForUser({
				username: GITHUB_USERNAME,
				type: 'owner',
				sort: 'updated',
				per_page: perPage,
				page: page
			});

			const repos = reposResponse.data as Repository[];

			if (repos.length === 0) {
				hasMoreRepos = false;
				console.log('No more repositories found.');
				break;
			}

			console.log(`Processing batch ${page} with ${repos.length} repos`);

			// Process repos in parallel within a batch for speed
			const batchPromises = repos.map(async originalRepo => {
				const siteMarkdown = await getSiteMarkdownContent(
					GITHUB_USERNAME,
					originalRepo.name
				);

				if (siteMarkdown) {
					// console.log(`Found site.md in ${originalRepo.name}`); // Debug log
					const parsedMarkdown = parseSiteMarkdown(siteMarkdown);

					let targetRepoData: GetRepoResponseData | null = null;
					let targetLanguages: Record<string, number> = {};
					let targetOwner = GITHUB_USERNAME;
					let targetRepoName = originalRepo.name;
					let isOverwritten = false;

					const overwriteInfo = parsedMarkdown.overwriteUrl
						? parseGitHubUrl(parsedMarkdown.overwriteUrl)
						: null;

					if (overwriteInfo) {
						console.log(
							`Repo ${originalRepo.name}: Found overwrite_url pointing to ${overwriteInfo.owner}/${overwriteInfo.repo}. Fetching data from target.`
						);
						targetOwner = overwriteInfo.owner;
						targetRepoName = overwriteInfo.repo;
						isOverwritten = true;
						targetRepoData = await fetchRepoDetails(
							targetOwner,
							targetRepoName
						);
						if (!targetRepoData) {
							console.warn(
								`Skipping project ${originalRepo.name} because fetching overwritten repo ${targetOwner}/${targetRepoName} failed.`
							);
							return null; // Indicate failure for this repo
						}
					} else {
						// No valid overwrite URL, use the original repo data
						// console.log(`Repo ${originalRepo.name}: No valid overwrite_url. Fetching data from original repo.`); // Debug log
						// Fetch detailed data for the original repo
						targetRepoData = await fetchRepoDetails(
							targetOwner,
							targetRepoName
						);
						if (!targetRepoData) {
							console.warn(
								`Skipping project ${originalRepo.name} because fetching its own details failed.`
							);
							return null; // Indicate failure for this repo
						}
						if (parsedMarkdown.overwriteUrl) {
							// Log if an overwriteUrl was present but invalid
							console.warn(
								`Repo ${originalRepo.name}: Invalid overwrite_url "${parsedMarkdown.overwriteUrl}". Using original repo data.`
							);
						}
					}

					// Fetch languages for the target repo (original or overwritten)
					// console.log(`Fetching languages for ${targetOwner}/${targetRepoName}`); // Debug log
					targetLanguages = await fetchRepoLanguages(
						targetOwner,
						targetRepoName
					);

					const projectData: RawProjectData = {
						repo: targetRepoData,
						siteMarkdown, // Keep raw markdown if needed later
						languages: targetLanguages,
						parsedMarkdown // Pass parsed markdown to transform function
					};

					return transformProjectData(projectData); // Return the transformed project
				} else {
					// console.log(`No site.md found in ${originalRepo.name}, skipping.`); // Debug log
					return null; // Indicate no project data generated
				}
			}); // End map

			// Wait for all promises in the batch to resolve
			const results = await Promise.all(batchPromises);

			// Filter out null results (skipped repos) and add valid projects
			results.forEach(project => {
				if (project) {
					portfolioProjects.push(project);
				}
			});

			// Check if we received fewer repos than requested, indicating the last page
			if (repos.length < perPage) {
				hasMoreRepos = false;
				console.log('Reached the last page of repositories.');
			} else {
				page++;
			}
		}

		// Sort by updated date (newest first) using data from the *target* repo
		portfolioProjects.sort((a, b) => {
			const dateA = new Date(a.updatedAt).getTime();
			const dateB = new Date(b.updatedAt).getTime();
			// Handle potential invalid dates (though unlikely from GitHub API)
			if (isNaN(dateA) || isNaN(dateB)) {
				return 0;
			}
			return dateB - dateA;
		});

		console.log(
			`Completed fetch. Found ${portfolioProjects.length} projects with site.md.`
		);

		return portfolioProjects;
	} catch (error: any) {
		console.error(
			'Error during portfolio data fetch process:',
			error.message || error
		);

		throw error;
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
	} catch (error: any) {
		console.error(
			`Error writing portfolio data to ${filePath}:`,
			error.message || error
		);
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