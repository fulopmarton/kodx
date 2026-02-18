import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Language ID mappings from VS Code languageId → Shiki lang
const LANG_MAP: Record<string, string> = {
	typescript: 'typescript',
	typescriptreact: 'tsx',
	javascript: 'javascript',
	javascriptreact: 'jsx',
	python: 'python',
	go: 'go',
	rust: 'rust',
	java: 'java',
	cpp: 'cpp',
	c: 'c',
	csharp: 'csharp',
	json: 'json',
	php: 'php',
	ruby: 'ruby',
	kotlin: 'kotlin',
	swift: 'swift',
	shellscript: 'bash',
};

const SUPPORTED_LANGS = Object.values(LANG_MAP);

let _highlighter: any = null;
let _currentThemeName: string | null = null;

// ── JSONC handling ──────────────────────────────────────────────────────────
// VS Code theme files use JSONC (JSON with Comments), so we need to strip
// comments and trailing commas before parsing.

function stripJsonComments(text: string): string {
	let result = '';
	let i = 0;
	let inString = false;
	let escaped = false;

	while (i < text.length) {
		const ch = text[i];

		if (escaped) {
			result += ch;
			escaped = false;
			i++;
			continue;
		}

		if (inString) {
			if (ch === '\\') {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			result += ch;
			i++;
			continue;
		}

		// Outside strings
		if (ch === '"') {
			inString = true;
			result += ch;
			i++;
		} else if (ch === '/' && text[i + 1] === '/') {
			// Line comment → skip to EOL
			while (i < text.length && text[i] !== '\n') { i++; }
		} else if (ch === '/' && text[i + 1] === '*') {
			// Block comment → skip to */
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { i++; }
			i += 2;
		} else {
			result += ch;
			i++;
		}
	}

	// Remove trailing commas before } or ]
	return result.replace(/,(\s*[}\]])/g, '$1');
}

// ── Theme resolution ────────────────────────────────────────────────────────

/**
 * Read a VS Code theme JSON file, recursively resolving `include` chains.
 */
async function resolveThemeFile(themePath: string): Promise<any> {
	const raw = await fs.promises.readFile(themePath, 'utf-8');
	const theme = JSON.parse(stripJsonComments(raw));

	if (theme.include) {
		const includePath = path.join(path.dirname(themePath), theme.include);
		try {
			const base = await resolveThemeFile(includePath);
			const merged = {
				...base,
				...theme,
				colors: { ...(base.colors || {}), ...(theme.colors || {}) },
				tokenColors: [...(base.tokenColors || []), ...(theme.tokenColors || [])],
			};
			delete merged.include;
			return merged;
		} catch {
			delete theme.include;
			return theme;
		}
	}

	return theme;
}

/**
 * Find the currently active VS Code color theme and load its JSON definition.
 * Returns `null` when the theme cannot be located or parsed.
 */
async function loadCurrentVscodeTheme(): Promise<any | null> {
	const themeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
	if (!themeName) { return null; }

	for (const ext of vscode.extensions.all) {
		const themes: any[] | undefined = ext.packageJSON?.contributes?.themes;
		if (!themes) { continue; }

		for (const entry of themes) {
			if (entry.label === themeName || entry.id === themeName) {
				const themePath = path.join(ext.extensionPath, entry.path);
				try {
					const themeJson = await resolveThemeFile(themePath);

					// Shiki requires a `name` (used as key) and `type` (dark | light)
					themeJson.name = themeJson.name || 'vscode-current';
					if (!themeJson.type) {
						const kind = vscode.window.activeColorTheme.kind;
						themeJson.type =
							kind === vscode.ColorThemeKind.Light ||
							kind === vscode.ColorThemeKind.HighContrastLight
								? 'light'
								: 'dark';
					}
					return themeJson;
				} catch (err) {
					console.warn('kodx: failed to load theme file', themePath, err);
					return null;
				}
			}
		}
	}

	return null;
}

// ── Highlighter lifecycle ───────────────────────────────────────────────────

async function getHighlighter() {
	if (!_highlighter) {
		// Dynamic import required — shiki is ESM-only
		const shiki = await import('shiki');

		const vsTheme = await loadCurrentVscodeTheme();

		if (vsTheme) {
			_currentThemeName = vsTheme.name;
			_highlighter = await shiki.createHighlighter({
				themes: [vsTheme],
				langs: SUPPORTED_LANGS,
			});
		} else {
			// Fallback: bundled Shiki themes
			_currentThemeName = null;
			_highlighter = await shiki.createHighlighter({
				themes: ['github-dark-default', 'github-light'],
				langs: SUPPORTED_LANGS,
			});
		}
	}
	return _highlighter;
}

/**
 * Returns the Shiki theme name to use when rendering code.
 * If the user's VS Code theme was loaded successfully the returned name
 * points to that theme; otherwise a sensible bundled fallback is used.
 */
export function getShikiTheme(): string {
	if (_currentThemeName) {
		return _currentThemeName;
	}
	const kind = vscode.window.activeColorTheme.kind;
	if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
		return 'github-light';
	}
	return 'github-dark-default';
}

/**
 * Syntax-highlight `code` and return an HTML string.
 * Falls back to a plain <pre><code> block on error.
 */
export async function highlightCode(
	code: string,
	languageId: string
): Promise<string> {
	try {
		const hl = await getHighlighter();
		const lang = LANG_MAP[languageId] ?? 'typescript';
		const theme = getShikiTheme();
		let html = hl.codeToHtml(code, { lang, theme });
		// Strip only background-related CSS properties, keep color for syntax highlighting
		html = html.replace(/background-color\s*:\s*[^;}"']+;?/gi, '');
		html = html.replace(/background\s*:\s*[^;}"']+;?/gi, '');
		return html;
	} catch (err) {
		console.error('kodx: highlight error', err);
		const escaped = escapeHtml(code);
		return `<pre style="white-space:pre;font-family:monospace">${escaped}</pre>`;
	}
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export function disposeHighlighter(): void {
	_highlighter?.dispose();
	_highlighter = null;
	_currentThemeName = null;
}
