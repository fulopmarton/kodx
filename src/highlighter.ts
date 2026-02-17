import * as vscode from 'vscode';

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
};

const SUPPORTED_LANGS = Object.values(LANG_MAP);

let _highlighter: any = null;

async function getHighlighter() {
	if (!_highlighter) {
		// Dynamic import required — shiki is ESM-only
		const shiki = await import('shiki');
		_highlighter = await shiki.createHighlighter({
			themes: ['github-dark-default', 'github-light'],
			langs: SUPPORTED_LANGS,
		});
	}
	return _highlighter;
}

/**
 * Returns the appropriate Shiki theme name based on current VS Code color theme.
 */
export function getShikiTheme(): string {
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
}
