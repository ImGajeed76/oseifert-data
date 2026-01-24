/** Output interfaces — these match exactly what the frontend consumes */

export interface Project {
	slug: string;
	title: string;
	description: string;
	url: string;
	homepage: string | null;
	stars: number;
	forks: number;
	license: string | null;
	createdAt: string;
	updatedAt: string;
	topics: string[];
	languages: Language[];
	primaryLanguage: string;
	owner: string;
	role: 'Creator' | 'Maintainer' | 'Contributor';
	readme: string;
	linkedBlogPosts: string[];
}

export interface Language {
	name: string;
	percentage: number;
	color: string;
}

export interface BlogPost {
	slug: string;
	title: string;
	excerpt: string;
	date: string;
	updated: string | null;
	tags: string[];
	projects: string[];
	content: string;
	draft: boolean;
	readingTime: number;
	externalUrl: string | null;
}

/** Internal types used during fetching */

export interface RawRepo {
	id: string;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	homepage: string | null;
	stargazers_count: number;
	forks_count: number;
	license: { spdx_id: string; name: string } | null;
	created_at: string;
	pushed_at: string;
	topics: string[];
	owner: { login: string };
	permissions?: { admin: boolean; maintain?: boolean; push: boolean; pull: boolean };
	private: boolean;
	archived: boolean;
	fork: boolean;
}

export interface PlatformConfig {
	type: 'github' | 'gitlab' | 'gitea' | 'codeberg';
	token: string;
	username: string;
	baseUrl?: string;
}
