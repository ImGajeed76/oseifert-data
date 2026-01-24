import type { PlatformClient } from './base.ts';
import type { RawRepo } from '../types.ts';

export class GiteaClient implements PlatformClient {
	private baseUrl: string;
	private token: string;
	readonly username: string;
	readonly platform: string;

	constructor(token: string, username: string, baseUrl: string, platform: 'gitea' | 'codeberg' = 'gitea') {
		this.token = token;
		this.username = username;
		this.baseUrl = baseUrl.replace(/\/$/, '');
		this.platform = platform;
	}

	private async apiFetch<T>(path: string): Promise<T | null> {
		const url = `${this.baseUrl}/api/v1${path}`;
		const res = await fetch(url, {
			headers: { 'Authorization': `token ${this.token}` },
		});
		if (!res.ok) return null;
		return res.json() as Promise<T>;
	}

	async fetchPermission(_owner: string, _repo: string): Promise<string> {
		// Gitea: if we fetched it, we're at minimum a member. Assume admin for own repos.
		return 'admin';
	}

	async fetchRepos(): Promise<RawRepo[]> {
		const repos: RawRepo[] = [];
		let page = 1;

		while (true) {
			const data = await this.apiFetch<any[]>(
				`/users/${this.username}/repos?limit=50&page=${page}`
			);
			if (!data || data.length === 0) break;

			for (const repo of data) {
				if (repo.private || repo.fork) continue;

				repos.push({
					id: String(repo.id),
					name: repo.name,
					full_name: repo.full_name,
					description: repo.description || null,
					html_url: repo.html_url,
					homepage: repo.website || null,
					stargazers_count: repo.stars_count || 0,
					forks_count: repo.forks_count || 0,
					license: null,
					created_at: repo.created_at || '',
					pushed_at: repo.updated_at || '',
					topics: repo.topics || [],
					owner: { login: repo.owner?.login || this.username },
					permissions: repo.permissions ? {
						admin: repo.permissions.admin || false,
						push: repo.permissions.push || false,
						pull: repo.permissions.pull || false,
					} : undefined,
					private: repo.private,
					archived: repo.archived || false,
					fork: repo.fork || false,
				});
			}

			page++;
		}

		return repos;
	}

	async fetchLanguages(owner: string, repo: string): Promise<Record<string, number>> {
		const data = await this.apiFetch<Record<string, number>>(
			`/repos/${owner}/${repo}/languages`
		);
		return data || {};
	}

	async fetchReadme(owner: string, repo: string): Promise<string> {
		const data = await this.apiFetch<{ content?: string; download_url?: string }>(
			`/repos/${owner}/${repo}/raw/README.md`
		);

		if (typeof data === 'string') return data;

		if (data?.content) {
			return Buffer.from(data.content, 'base64').toString('utf-8');
		}

		// Try fetching raw
		try {
			const url = `${this.baseUrl}/${owner}/${repo}/raw/branch/main/README.md`;
			const res = await fetch(url);
			if (res.ok) return await res.text();
		} catch { /* ignore */ }

		return '';
	}
}
