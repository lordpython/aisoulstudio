/**
 * Prompt Template Loader
 *
 * Loads format-specific prompt templates from external text files.
 * Supports {{variable}} substitution for dynamic content injection.
 *
 * Directory structure:
 *   services/prompt/templates/{formatId}/{phase}.txt
 *
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
 */

// Eagerly import all .txt template files via Vite's raw text loader.
// Path is relative to this file: services/prompt/templates/
// Vitest processes this the same way as the browser build.
const _rawFiles = import.meta.glob<string>(
  './templates/**/*.txt',
  { query: '?raw', import: 'default', eager: true }
);

// Normalize Vite glob keys: './templates/movie-animation/breakdown.txt'
// → registry key: 'movie-animation/breakdown'
const templateRegistry: Record<string, string> = {};
for (const [path, content] of Object.entries(_rawFiles)) {
  const match = path.match(/\.\/templates\/(.+)\.txt$/);
  if (match && match[1]) {
    templateRegistry[match[1]] = content;
  }
}

/**
 * Load a prompt template for a given format and phase.
 * Throws with a descriptive error if the template file is missing (Req 21.2).
 *
 * @param formatId - Video format identifier (e.g., 'movie-animation', 'youtube-narrator')
 * @param phase    - Pipeline phase name (e.g., 'breakdown', 'screenplay')
 */
export function loadTemplate(formatId: string, phase: string): string {
  const key = `${formatId}/${phase}`;
  const template = templateRegistry[key];
  if (template === undefined) {
    const available = Object.keys(templateRegistry)
      .sort()
      .join(', ');
    throw new Error(
      `Prompt template not found: '${key}.txt'. ` +
      `Ensure the file exists at services/prompt/templates/${key}.txt. ` +
      `Available templates: ${available || '(none)'}`
    );
  }
  return template;
}

/**
 * Substitute {{variable}} placeholders in a template string.
 * Variables not present in the vars map are left unchanged.
 *
 * @param template - Template string containing {{variable}} placeholders
 * @param vars     - Map of variable name → substitution value
 */
export function substituteVariables(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name]! : `{{${name}}}`
  );
}

/**
 * Check whether a template exists for the given format and phase without throwing.
 */
export function hasTemplate(formatId: string, phase: string): boolean {
  return (`${formatId}/${phase}`) in templateRegistry;
}

/**
 * Programmatically register (or override) a template.
 * Intended for tests and dynamic registration — does not persist to disk.
 */
export function setTemplate(formatId: string, phase: string, content: string): void {
  templateRegistry[`${formatId}/${phase}`] = content;
}

/**
 * Return all registered template keys (format/phase pairs).
 * Useful for introspection and validation.
 */
export function listTemplates(): string[] {
  return Object.keys(templateRegistry).sort();
}
