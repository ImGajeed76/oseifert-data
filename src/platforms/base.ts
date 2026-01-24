import type { RawRepo, Language } from '../types.ts';

export interface PlatformClient {
	/** Fetch all repos accessible to the authenticated user (owned + collaborator) */
	fetchRepos(): Promise<RawRepo[]>;

	/** Fetch language breakdown for a repo */
	fetchLanguages(owner: string, repo: string): Promise<Record<string, number>>;

	/** Fetch README content (raw markdown) for a repo */
	fetchReadme(owner: string, repo: string): Promise<string>;

	/** The username of the authenticated user on this platform */
	readonly username: string;

	/** Platform type identifier */
	readonly platform: string;
}

/** Derive role from repo owner and permissions */
export function deriveRole(
	repoOwner: string,
	authenticatedUser: string,
	permissions?: { admin: boolean; maintain?: boolean; push: boolean }
): 'Creator' | 'Maintainer' | 'Contributor' {
	if (repoOwner === authenticatedUser) return 'Creator';
	if (permissions?.admin || permissions?.maintain) return 'Maintainer';
	return 'Contributor';
}

/** Format repo name into a readable title */
export function formatTitle(repoName: string): string {
	return repoName
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert raw byte counts to Language[] with percentages and colors */
export function processLanguages(
	rawLangs: Record<string, number>,
	getColor: (name: string) => string
): Language[] {
	const total = Object.values(rawLangs).reduce((sum, bytes) => sum + bytes, 0);
	if (total === 0) return [];

	return Object.entries(rawLangs)
		.sort(([, a], [, b]) => b - a)
		.map(([name, bytes]) => ({
			name,
			percentage: Math.round((bytes / total) * 1000) / 10,
			color: getColor(name),
		}));
}

/**
 * Generate a deterministic, unique, URL-safe slug from a repo name + ID.
 * Format: {kebab-name}-{id_prefix}
 * - Repo name is lowercased, non-alphanumeric replaced with hyphens
 * - Appends first 4 characters of the repo ID for guaranteed uniqueness
 * - Same repo always produces the same slug (ID is stable and never changes)
 */
export function generateSlug(repoName: string, repoId: string): string {
	const base = repoName
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	const idSuffix = repoId.slice(0, 4);
	return `${base}-${idSuffix}`;
}
