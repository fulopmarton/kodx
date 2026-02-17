import * as vscode from 'vscode';
import { resolveFunctionDefinition } from './resolver';
import { findEnclosingFunctionRange, parseFunctionCallsInRange, FunctionDefinition } from './parser';
import { highlightCode, getShikiTheme } from './highlighter';

/**
 * Manages the kodx side panel that shows all function implementations
 * called from within the function the cursor is currently inside.
 */
export class XrayPanel {
	private static _instance: XrayPanel | undefined;
	private _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _currentEnclosingLine = -1;

	private constructor(panel: vscode.WebviewPanel) {
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.html = this._emptyHtml();
	}

	static getInstance(context: vscode.ExtensionContext): XrayPanel {
		if (!XrayPanel._instance) {
			const panel = vscode.window.createWebviewPanel(
				'kodxXray',
				'kodx: Xray',
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: false, retainContextWhenHidden: true }
			);
			XrayPanel._instance = new XrayPanel(panel);
		}
		return XrayPanel._instance;
	}

	static isOpen(): boolean {
		return !!XrayPanel._instance;
	}

	/**
	 * Update the panel for the function the cursor is currently inside.
	 */
	async updateForEditor(editor: vscode.TextEditor): Promise<void> {
		const document = editor.document;
		const position = editor.selection.active;

		const enclosingRange = await findEnclosingFunctionRange(document, position);
		if (!enclosingRange) {
			return;
		}

		if (enclosingRange.start.line === this._currentEnclosingLine) {
			return;
		}
		this._currentEnclosingLine = enclosingRange.start.line;

		// Collect unique function calls inside the enclosing function
		const calls = parseFunctionCallsInRange(document, enclosingRange);
		const seen = new Set<string>();
		const unique = calls.filter((c) => {
			if (seen.has(c.name)) { return false; }
			seen.add(c.name);
			return true;
		});

		if (unique.length === 0) {
			this._panel.webview.html = this._emptyHtml('No resolvable function calls found in this scope.');
			this._panel.title = 'kodx: Xray';
			return;
		}

		// Resolve all definitions in parallel
		const resolved = await Promise.all(
			unique.map(async (call) => {
				const def = await resolveFunctionDefinition(call.name, document);
				return def ?? null;
			})
		);
		const definitions = resolved.filter((d): d is FunctionDefinition => d !== null);

		if (definitions.length === 0) {
			this._panel.webview.html = this._emptyHtml('No definitions could be resolved for calls in this scope.');
			this._panel.title = 'kodx: Xray';
			return;
		}

		// Derive enclosing function name
		const enclosingLine = document.lineAt(enclosingRange.start.line).text.trim();
		const nameMatch = enclosingLine.match(/(?:function\s+(\w+)|(?:async\s+)?(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\())/);
		const enclosingName = nameMatch?.[1] ?? nameMatch?.[2] ?? '(anonymous)';

		this._panel.webview.html = await this._getHtml(enclosingName, definitions, document.languageId);
		this._panel.title = `kodx: ${enclosingName}`;
	}

	private async _getHtml(
		enclosingName: string,
		definitions: FunctionDefinition[],
		editorLanguageId: string
	): Promise<string> {
		// Highlight all definitions in parallel
		const highlighted = await Promise.all(
			definitions.map(async (def) => {
				const langId = langFromUri(def.uri) ?? editorLanguageId;
				const html = await highlightCode(def.content, langId);
				const relativePath = vscode.workspace.asRelativePath(def.uri);
				return { name: def.name, relativePath, html };
			})
		);

		const theme = getShikiTheme();
		const isDark = theme !== 'github-light';

		const hunksHtml = highlighted.map(({ name, relativePath, html }) => `
<div class="hunk">
  <div class="hunk-header">
    <span class="fn-name">${escapeHtml(name)}</span>
    <span class="filepath">${escapeHtml(relativePath)}</span>
  </div>
  <div class="hunk-body">${html}</div>
</div>`).join('\n');

		return `<!DOCTYPE html>
<html lang="en" data-theme="${isDark ? 'dark' : 'light'}">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
  }

  .scope-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    padding: 7px 14px;
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .scope-header .label { opacity: 0.6; }
  .scope-header .scope-name {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
    font-weight: 600;
  }
  .scope-header .count {
    margin-left: auto;
    opacity: 0.5;
    font-size: 0.9em;
  }

  .hunk {
    border-bottom: 1px solid var(--vscode-editorGroup-border);
  }

  .hunk-header {
    padding: 6px 14px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    display: flex;
    align-items: baseline;
    gap: 10px;
    border-top: 1px solid var(--vscode-editorGroup-border);
  }
  .fn-name {
    font-family: var(--vscode-editor-font-family, monospace);
    font-weight: 700;
    font-size: 0.95em;
    color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
  }
  .filepath {
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    opacity: 0.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* shiki output: strip its background so our theme bg shows through */
  .hunk-body pre.shiki {
    margin: 0;
    padding: 10px 14px;
    background: transparent !important;
    overflow-x: auto;
    border-radius: 0;
  }
  .hunk-body pre.shiki code {
    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
    font-size: inherit;
    line-height: 1.6;
  }

  .empty {
    padding: 40px 20px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    text-align: center;
    opacity: 0.55;
  }
</style>
</head>
<body>
<div class="scope-header">
  <span class="label">inside</span>
  <span class="scope-name">${escapeHtml(enclosingName)}</span>
  <span class="count">${definitions.length} call${definitions.length === 1 ? '' : 's'}</span>
</div>
${hunksHtml}
</body>
</html>`;
	}

	private _emptyHtml(message = 'Move cursor inside a function to see its callees here.'): string {
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-editor-font-family, sans-serif); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  .empty { padding: 40px 20px; color: var(--vscode-descriptionForeground); font-style: italic; text-align: center; opacity: 0.55; margin-top: 40px; }
</style></head><body><div class="empty">${message}</div></body></html>`;
	}

	dispose(): void {
		XrayPanel._instance = undefined;
		this._panel.dispose();
		this._disposables.forEach((d) => d.dispose());
		this._disposables = [];
	}
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function langFromUri(uri: vscode.Uri): string | null {
	const ext = uri.fsPath.split('.').pop() ?? '';
	const map: Record<string, string> = {
		ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
		py: 'python', go: 'go', rs: 'rust', java: 'java',
		cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c',
		cs: 'csharp', json: 'json',
	};
	return map[ext] ?? null;
}

