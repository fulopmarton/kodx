import * as vscode from 'vscode';
import { resolveFunctionDefinition } from './resolver';
import { findEnclosingFunctionRange, parseFunctionCallsInRange, FunctionDefinition, EnclosingFunction } from './parser';
import { highlightCode } from './highlighter';

/**
 * Manages the kodx side panel that shows all function implementations
 * called from within the function the cursor is currently inside.
 */
export class XrayPanel {
	private static _instance: XrayPanel | undefined;
	private _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _currentEnclosingLine = -1;
	private _currentHighlightedCall: string | null = null;

	private constructor(panel: vscode.WebviewPanel) {
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		
		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				if (message.command === 'navigate') {
					const uri = vscode.Uri.parse(message.uri);
					const position = new vscode.Position(message.line, 0);
					const doc = await vscode.workspace.openTextDocument(uri);
					await vscode.window.showTextDocument(doc, {
						selection: new vscode.Range(position, position),
						viewColumn: vscode.ViewColumn.One,
					});
				}
			},
			null,
			this._disposables
		);
		
		this._panel.webview.html = this._emptyHtml();
	}

	static getInstance(context: vscode.ExtensionContext): XrayPanel {
		if (!XrayPanel._instance) {
			const panel = vscode.window.createWebviewPanel(
				'kodxXray',
				'kodx: Xray',
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: true, retainContextWhenHidden: true }
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

		const enclosingFunction = await findEnclosingFunctionRange(document, position);
		if (!enclosingFunction) {
			return;
		}

		// Detect the function call name under the cursor
		const wordRange = document.getWordRangeAtPosition(position);
		const wordAtCursor = wordRange ? document.getText(wordRange) : null;

		if (enclosingFunction.range.start.line === this._currentEnclosingLine) {
			// Same enclosing function — just scroll to the call under cursor
			if (wordAtCursor && wordAtCursor !== this._currentHighlightedCall) {
				this._currentHighlightedCall = wordAtCursor;
				this._scrollToFunction(wordAtCursor);
			}
			return;
		}
		this._currentEnclosingLine = enclosingFunction.range.start.line;

		const enclosingName = enclosingFunction.name;

		// Collect unique function calls inside the enclosing function
		const calls = parseFunctionCallsInRange(document, enclosingFunction.range);
		const seen = new Set<string>();
		const unique = calls.filter((c) => {
			// Exclude the enclosing function itself (recursive calls)
			if (c.name === enclosingName) { return false; }
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

		this._panel.webview.html = await this._getHtml(enclosingName, definitions, document.languageId);
		this._panel.title = `kodx: ${enclosingName}`;

		// After rendering, scroll to the call under cursor if any
		if (wordAtCursor) {
			this._currentHighlightedCall = wordAtCursor;
			// Small delay to let the webview render before scrolling
			setTimeout(() => this._scrollToFunction(wordAtCursor), 80);
		}
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
				return { 
					name: def.name, 
					relativePath, 
					html,
					uri: def.uri.toString(),
					line: def.startLine,
				};
			})
		);

		const kind = vscode.window.activeColorTheme.kind;
		const isDark = kind !== vscode.ColorThemeKind.Light && kind !== vscode.ColorThemeKind.HighContrastLight;

		const hunksHtml = highlighted.map(({ name, relativePath, html, uri, line }) => `
<div class="hunk" data-uri="${escapeHtml(uri)}" data-line="${line}" data-fn="${escapeHtml(name)}">
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
    cursor: pointer;
    transition: background-color 0.1s ease;
  }
  
  .hunk:hover {
    background-color: var(--vscode-list-hoverBackground);
  }
  .hunk.active {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
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
    background: transparent !important;
  }
  .hunk-body pre.shiki code *,
  .hunk-body pre.shiki span,
  .hunk-body pre.shiki .line {
    background: transparent !important;
    background-color: transparent !important;
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
<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('.hunk').forEach(hunk => {
    hunk.addEventListener('click', () => {
      const uri = hunk.getAttribute('data-uri');
      const line = parseInt(hunk.getAttribute('data-line'), 10);
      vscode.postMessage({ command: 'navigate', uri, line });
    });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'scrollToFunction') {
      const name = msg.name;
      // Remove previous active highlight
      document.querySelectorAll('.hunk.active').forEach(el => el.classList.remove('active'));
      const target = document.querySelector('.hunk[data-fn=\"' + CSS.escape(name) + '\"]');
      if (target) {
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
</script>
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

	/**
	 * Force the next updateForEditor call to re-render, even if the cursor
	 * is still inside the same enclosing function (e.g. after a theme change).
	 */
	resetCurrentScope(): void {
		this._currentEnclosingLine = -1;
		this._currentHighlightedCall = null;
	}

	/**
	 * Tell the webview to scroll to and highlight the hunk for `fnName`.
	 */
	private _scrollToFunction(fnName: string): void {
		this._panel.webview.postMessage({ command: 'scrollToFunction', name: fnName });
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

