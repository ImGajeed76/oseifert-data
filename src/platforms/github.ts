import { Octokit } from '@octokit/rest';
import type { PlatformClient } from './base.ts';
import type { RawRepo } from '../types.ts';

export class GitHubClient implements PlatformClient {
	private octokit: Octokit;
	readonly username: string;
	readonly platform = 'github';

	constructor(token: string, username: string) {
		this.octokit = new Octokit({ auth: token });
		this.username = username;
	}

	async fetchRepos(): Promise<RawRepo[]> {
		const repos: RawRepo[] = [];
		let page = 1;

		while (true) {
			const { data } = await this.octokit.repos.listForAuthenticatedUser({
				affiliation: 'owner,collaborator',
				per_page: 100,
				page,
				sort: 'pushed',
			});

			if (data.length === 0) break;

			for (const repo of data) {
				if (repo.private || repo.fork) continue;

				repos.push({
					id: String(repo.id),
					name: repo.name,
					full_name: repo.full_name,
					description: repo.description,
					html_url: repo.html_url,
					homepage: repo.homepage || null,
					stargazers_count: repo.stargazers_count,
					forks_count: repo.forks_count,
					license: repo.license ? { spdx_id: repo.license.spdx_id || '', name: repo.license.name || '' } : null,
					created_at: repo.created_at || '',
					pushed_at: repo.pushed_at || '',
					topics: repo.topics || [],
					owner: { login: repo.owner.login },
					permissions: repo.permissions ? {
						admin: repo.permissions.admin || false,
						maintain: repo.permissions.maintain,
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
		try {
			const { data } = await this.octokit.repos.listLanguages({ owner, repo });
			return data as Record<string, number>;
		} catch {
			return {};
		}
	}

	async fetchReadme(owner: string, repo: string): Promise<string> {
		try {
			const { data } = await this.octokit.repos.getReadme({
				owner,
				repo,
				mediaType: { format: 'raw' },
			});
			return data as unknown as string;
		} catch {
			return '';
		}
	}
}
