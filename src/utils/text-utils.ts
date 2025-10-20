// Text processing utilities

export function cleanDescription(text: string): string {
  if (!text) return '';
  
  // Remove markdown badges (lines starting with [![)
  text = text.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '');
  
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove any leading/trailing whitespace
  text = text.trim();
  
  // Split into lines and find the first substantial paragraph
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Skip header lines (starting with #), badges, and other non-content lines
  const contentLines = lines.filter(line => {
    return !line.startsWith('#') && 
           !line.startsWith('[![') && 
           !line.startsWith('[!') &&
           !line.startsWith('http') &&
           !line.startsWith('<!--') &&
           !line.match(/^[-=]+$/) && // Skip underlines
           line.length > 10; // Skip very short lines
  });
  
  if (contentLines.length === 0) {
    // If no good content lines, try to extract from the beginning
    const cleanedText = text.replace(/^\s*#+\s*.*$/gm, '').trim();
    if (cleanedText) {
      const firstSentence = cleanedText.split(/[.!?]/)[0];
      if (firstSentence && firstSentence.length > 10) {
        return firstSentence.trim() + (cleanedText.includes('.') ? '.' : '');
      }
    }
    return '';
  }
  
  // Get first substantial paragraph
  let description = contentLines[0];
  
  // Try to get a complete sentence
  if (!description.match(/[.!?]$/)) {
    // Look for more content to complete the sentence
    const nextLine = contentLines[1];
    if (nextLine && !nextLine.match(/^[-*+]/) && description.length + nextLine.length < 150) {
      description += ' ' + nextLine;
    }
  }
  
  // Truncate if too long
  if (description.length > 200) {
    const truncated = description.substring(0, 197);
    // Try to end at a word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 150) {
      description = truncated.substring(0, lastSpace) + '...';
    } else {
      description = truncated + '...';
    }
  }
  
  return description;
}

export function extractTechnologiesFromTopics(topics: string[]): string[] {
  // Filter and transform topics into technology names
  const techKeywords = new Set([
    'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'cpp', 'c', 'csharp',
    'react', 'vue', 'angular', 'svelte', 'nodejs', 'express', 'fastapi', 'django',
    'postgresql', 'mysql', 'mongodb', 'redis', 'docker', 'kubernetes',
    'aws', 'gcp', 'azure', 'firebase', 'vercel', 'netlify',
    'graphql', 'rest', 'api', 'microservices', 'serverless',
    'machine-learning', 'ai', 'tensorflow', 'pytorch', 'opencv',
    'blockchain', 'web3', 'solidity', 'ethereum',
    'mobile', 'android', 'ios', 'flutter', 'react-native',
    'game-development', 'unity', 'unreal-engine',
    'web', 'frontend', 'backend', 'fullstack', 'cli', 'desktop'
  ]);
  
  return topics
    .filter(topic => techKeywords.has(topic.toLowerCase()) || topic.endsWith('-js') || topic.endsWith('-py'))
    .map(topic => {
      // Convert common variations to standard names
      const normalized = topic.toLowerCase();
      if (normalized === 'js' || normalized === 'javascript') return 'JavaScript';
      if (normalized === 'ts' || normalized === 'typescript') return 'TypeScript';
      if (normalized === 'py' || normalized === 'python') return 'Python';
      if (normalized === 'nodejs' || normalized === 'node') return 'Node.js';
      if (normalized === 'reactjs' || normalized === 'react') return 'React';
      if (normalized === 'vuejs' || normalized === 'vue') return 'Vue.js';
      if (normalized === 'cpp' || normalized === 'c++') return 'C++';
      if (normalized === 'csharp' || normalized === 'c#') return 'C#';
      
      // Capitalize first letter
      return topic.charAt(0).toUpperCase() + topic.slice(1);
    })
    .slice(0, 3); // Limit to 3 technologies
}

export function extractTechnologiesFromLanguages(languages: Array<{name: string; percentage: number}>): string[] {
  // Get top programming languages, excluding data/config formats
  const programmingLanguages = languages
    .filter(lang => !isDataLanguage(lang.name))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5)
    .map(lang => lang.name);
    
  return programmingLanguages;
}

function isDataLanguage(language: string): boolean {
  const dataLanguages = new Set([
    'JSON', 'YAML', 'XML', 'CSV', 'TOML', 'INI',
    'G-code', 'Jupyter Notebook', 'Markdown',
    'Text', 'Binary', 'Ignore List', 'Dockerfile',
    'Makefile', 'CMake', 'Batchfile', 'PowerShell',
    'Shell', 'Bash'
  ]);
  
  return dataLanguages.has(language);
}

export function filterProgrammingLanguages(languages: Record<string, number>): Record<string, number> {
  const filtered: Record<string, number> = {};
  
  for (const [language, bytes] of Object.entries(languages)) {
    if (!isDataLanguage(language)) {
      filtered[language] = bytes;
    }
  }
  
  return filtered;
}