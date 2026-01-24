import type { RawRepo, Language } from '../types.ts';

export interface PlatformClient {
	/** Fetch all repos accessible to the authenticated user (owned + collaborator + org) */
	fetchRepos(): Promise<RawRepo[]>;

	/** Fetch the user's actual role on a repo (admin, maintain, write, triage, read) */
	fetchPermission(owner: string, repo: string): Promise<string>;

	/** Fetch language breakdown for a repo */
	fetchLanguages(owner: string, repo: string): Promise<Record<string, number>>;

	/** Fetch README content (raw markdown) for a repo */
	fetchReadme(owner: string, repo: string): Promise<string>;

	/** The username of the authenticated user on this platform */
	readonly username: string;

	/** Platform type identifier */
	readonly platform: string;
}

/** Derive role from repo owner, owner type, and the actual role_name from the API */
export function deriveRole(
	repoOwner: string,
	ownerType: string | undefined,
	authenticatedUser: string,
	roleName: string
): 'Creator' | 'Maintainer' | 'Contributor' {
	// Personal repo owned by the user
	if (repoOwner === authenticatedUser) return 'Creator';
	// Org repo where the user has admin (org owner/admin)
	if (ownerType === 'Organization' && roleName === 'admin') return 'Creator';
	// Admin, maintain, or write access on someone else's repo = Maintainer
	// (write = direct push access, beyond typical contributor who only PRs)
	if (roleName === 'admin' || roleName === 'maintain' || roleName === 'write') return 'Maintainer';
	// Everything else (triage, read)
	return 'Contributor';
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
