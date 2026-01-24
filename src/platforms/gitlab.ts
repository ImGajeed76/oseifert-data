import type { PlatformClient } from './base.ts';
import type { RawRepo } from '../types.ts';

export class GitLabClient implements PlatformClient {
	private baseUrl: string;
	private token: string;
	readonly username: string;
	readonly platform = 'gitlab';

	constructor(token: string, username: string, baseUrl = 'https://gitlab.com') {
		this.token = token;
		this.username = username;
		this.baseUrl = baseUrl.replace(/\/$/, '');
	}

	private async apiFetch<T>(path: string): Promise<T | null> {
		const url = `${this.baseUrl}/api/v4${path}`;
		const res = await fetch(url, {
			headers: { 'PRIVATE-TOKEN': this.token },
		});
		if (!res.ok) return null;
		return res.json() as Promise<T>;
	}

	async fetchPermission(_owner: string, _repo: string): Promise<string> {
		// GitLab: if we fetched it, we're at minimum a member. Assume admin for own repos.
		return 'admin';
	}

	async fetchRepos(): Promise<RawRepo[]> {
		const repos: RawRepo[] = [];
		let page = 1;

		while (true) {
			const data = await this.apiFetch<any[]>(
				`/users/${this.username}/projects?per_page=100&page=${page}&visibility=public`
			);
			if (!data || data.length === 0) break;

			for (const repo of data) {
				if (repo.forked_from_project) continue;

				repos.push({
					id: String(repo.id),
					name: repo.path,
					full_name: repo.path_with_namespace,
					description: repo.description || null,
					html_url: repo.web_url,
					homepage: null,
					stargazers_count: repo.star_count || 0,
					forks_count: repo.forks_count || 0,
					license: null, // GitLab doesn't include license in list endpoint
					created_at: repo.created_at || '',
					pushed_at: repo.last_activity_at || '',
					topics: repo.topics || repo.tag_list || [],
					owner: { login: repo.namespace?.path || this.username },
					permissions: { admin: true, push: true, pull: true },
					private: repo.visibility !== 'public',
					archived: repo.archived || false,
					fork: !!repo.forked_from_project,
				});
			}

			page++;
		}

		return repos;
	}

	async fetchLanguages(owner: string, repo: string): Promise<Record<string, number>> {
		const projectId = encodeURIComponent(`${owner}/${repo}`);
		const data = await this.apiFetch<Record<string, number>>(`/projects/${projectId}/languages`);
		if (!data) return {};

		// GitLab returns percentages, convert to fake byte counts for consistency
		const result: Record<string, number> = {};
		for (const [lang, pct] of Object.entries(data)) {
			result[lang] = Math.round(pct * 100);
		}
		return result;
	}

	async fetchReadme(owner: string, repo: string): Promise<string> {
		const projectId = encodeURIComponent(`${owner}/${repo}`);

		for (const branch of ['main', 'master']) {
			for (const filename of ['README.md', 'readme.md', 'README']) {
				const filePath = encodeURIComponent(filename);
				const data = await this.apiFetch<{ content: string }>(
					`/projects/${projectId}/repository/files/${filePath}?ref=${branch}`
				);
				if (data?.content) {
					return Buffer.from(data.content, 'base64').toString('utf-8');
				}
			}
		}

		return '';
	}
}
