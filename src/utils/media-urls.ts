/**
 * Rewrite embedded media URLs (![alt](url)) in markdown so that:
 *
 * 1. Relative paths (./assets/img.png  or  assets/img.png)
 *    → https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{defaultBranch}/{path}
 *
 * 2. GitHub "blob" URLs
 *    (https://github.com/{owner}/{repo}/blob/{branch}/path)
 *    → https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}/path
 *
 * Only touches ![…](…) (embedded media). Regular [links](…) are left alone.
 */

/** Pattern that matches a GitHub blob URL and captures owner, repo, branch, path */
const GITHUB_BLOB_RE =
	/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;

/**
 * Returns true when the URL string looks like an absolute URL (any scheme).
 * Anchors (#…) and protocol-relative (//…) are also treated as absolute.
 */
function isAbsolute(url: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
}

/**
 * Rewrite embedded media links in a markdown string.
 *
 * @param markdown  Raw markdown content
 * @param owner     Repository owner  (e.g. "ImGajeed76")
 * @param repo      Repository name   (e.g. "quick-cards")
 * @param defaultBranch  Fallback branch for relative paths (default "main")
 * @param pathPrefix  Optional directory prefix for relative paths
 *                    (e.g. "data/blog" so that ./images/x.png → data/blog/images/x.png)
 */
export function rewriteMediaUrls(
	markdown: string,
	owner: string,
	repo: string,
	defaultBranch = 'main',
	pathPrefix = '',
): string {
	// Match ![alt](url) — the negative lookbehind (?<!\\) avoids escaped bangs.
	// Captures:  group1 = everything before the URL  group2 = the URL
	return markdown.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		(_match, alt: string, rawUrl: string) => {
			const url = rawUrl.trim();

			// Case 1: GitHub blob URL → raw URL
			const blobMatch = url.match(GITHUB_BLOB_RE);
			if (blobMatch) {
				const [, bOwner, bRepo, branch, path] = blobMatch;
				return `![${alt}](https://raw.githubusercontent.com/${bOwner}/${bRepo}/refs/heads/${branch}/${path})`;
			}

			// Case 2: Relative path → raw URL (skip absolute URLs that aren't GitHub blob)
			if (!isAbsolute(url)) {
				const cleanPath = url.replace(/^\.\//, '');
				const prefix = pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/` : '';
				return `![${alt}](https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${defaultBranch}/${prefix}${cleanPath})`;
			}

			// Already an absolute non-blob URL — leave as-is
			return `![${alt}](${url})`;
		},
	);
}
