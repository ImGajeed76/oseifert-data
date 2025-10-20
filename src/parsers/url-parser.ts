import type { GitPlatformInfo } from '../types';

export function parseGitUrl(url: string): GitPlatformInfo | null {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) {
      return null;
    }

    const [owner, repoRaw] = pathParts;
    const repo = repoRaw.replace(/\.git$/, '');

    // Detect platform by hostname
    let type: GitPlatformInfo['type'] = 'unknown';
    let apiSupported = false;

    if (hostname === 'github.com') {
      type = 'github';
      apiSupported = true;
    } else if (hostname === 'gitlab.com' || hostname.includes('gitlab')) {
      type = 'gitlab';
      apiSupported = true;
    } else if (hostname === 'codeberg.org') {
      type = 'codeberg';
      apiSupported = true;
    } else if (hostname.includes('gitea') || hostname.includes('forgejo')) {
      type = 'gitea'; // or 'forgejo'
      apiSupported = true;
    }

    return {
      type,
      owner,
      repo,
      baseUrl: `${parsedUrl.protocol}//${parsedUrl.hostname}`,
      apiSupported
    };
  } catch (error) {
    console.warn(`Failed to parse git URL: ${url}`, error);
    return null;
  }
}

// Detect platform type from URL without full parsing
export function detectPlatformType(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    if (hostname === 'github.com') return 'github';
    if (hostname === 'gitlab.com' || hostname.includes('gitlab')) return 'gitlab';
    if (hostname === 'codeberg.org') return 'codeberg';
    if (hostname.includes('gitea')) return 'gitea';
    if (hostname.includes('forgejo')) return 'forgejo';
    
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}