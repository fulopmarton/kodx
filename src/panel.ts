import * as vscode from 'vscode';
import { resolveFunctionDefinition } from './resolver';
import { findEnclosingFunctionRange, parseFunctionCallsInRange } from './parser';
import { FunctionDefinition } from './parser';

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

		// Find the function whose body contains the cursor
		const enclosingRange = await findEnclosingFunctionRange(document, position);
		if (!enclosingRange) {
			return;
		}

		// Avoid re-rendering when cursor stays in the same function
		if (enclosingRange.start.line === this._currentEnclosingLine) {
			return;
		}
		this._currentEnclosingLine = enclosingRange.start.line;

		// Get all function calls within that range, deduplicated by name
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

		// Figure out enclosing function name for the title
		const enclosingLine = document.lineAt(enclosingRange.start.line).text.trim();
		const nameMatch = enclosingLine.match(/(?:function\s+(\w+)|(?:async\s+)?(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\())/);
		const enclosingName = nameMatch?.[1] ?? nameMatch?.[2] ?? '(anonymous)';

		this._panel.webview.html = this._getHtml(enclosingName, definitions);
		this._panel.title = `kodx: inside ${enclosingName}`;
	}

	private _getHtml(enclosingName: string, definitions: FunctionDefinition[]): string {
		const maxLen = vscode.workspace.getConfiguration('kodx').get<number>('maxInlineLength', 120);

		const hunksHtml = definitions.map((def) => {
			const relativePath = vscode.workspace.asRelativePath(def.uri);
			const lines = def.content
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.split('\n')
				.map((l) => l.slice(0, maxLen));

			const lineRows = lines
				.map(
					(line, i) =>
						`<div class="line"><span class="ln">${i + 1}</span><span class="plus">+</span><span class="code">${line}</span></div>`
				)
				.join('');

			return `<div class="hunk">
  <div class="hunk-header">
    <span class="fn-name">${def.name}</span>
    <span class="filepath">${relativePath}</span>
  </div>
  <div class="hunk-body">${lineRows}</div>
</div>`;
		}).join('\n');

		return `<!DOCTYPE html>
<html lang="en">
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
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 2px solid var(--vscode-editorGroup-border);
    padding: 8px 12px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
  }
  .scope-header strong {
    color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .hunk {
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    margin-bottom: 0;
  }
  .hunk-header {
    background: var(--vscode-editorGroupHeader-tabsBackground);
    padding: 5px 12px;
    display: flex;
    gap: 10px;
    align-items: baseline;
    border-left: 3px solid var(--vscode-gitDecoration-addedResourceForeground, #4caf50);
  }
  .fn-name {
    font-weight: bold;
    color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
  }
  .filepath {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8em;
    opacity: 0.65;
  }
  .hunk-body {
    background: color-mix(in srgb, var(--vscode-diffEditor-insertedTextBackground, #28a74526) 60%, transparent);
  }
  .line {
    display: flex;
    align-items: flex-start;
    line-height: 1.6;
    border-left: 3px solid var(--vscode-gitDecoration-addedResourceForeground, #4caf50);
  }
  .line:hover { background: var(--vscode-list-hoverBackground); }
  .ln {
    min-width: 36px;
    text-align: right;
    padding: 0 8px;
    color: var(--vscode-editorLineNumber-foreground);
    user-select: none;
    font-size: 0.82em;
    opacity: 0.55;
    flex-shrink: 0;
  }
  .plus {
    min-width: 14px;
    color: var(--vscode-gitDecoration-addedResourceForeground, #4caf50);
    user-select: none;
    flex-shrink: 0;
  }
  .code {
    white-space: pre;
    flex: 1;
    padding-right: 12px;
  }
  .empty {
    padding: 32px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    text-align: center;
    opacity: 0.6;
  }
</style>
</head>
<body>
<div class="scope-header">calls inside <strong>${enclosingName}</strong> — ${definitions.length} resolved</div>
${hunksHtml}
</body>
</html>`;
	}

	private _emptyHtml(message = 'Move cursor inside a function to see its callees here.'): string {
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-editor-font-family, sans-serif); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  .empty { padding: 32px; color: var(--vscode-descriptionForeground); font-style: italic; text-align: center; opacity: 0.6; margin-top: 40px; }
</style></head><body><div class="empty">${message}</div></body></html>`;
	}

	dispose(): void {
		XrayPanel._instance = undefined;
		this._panel.dispose();
		this._disposables.forEach((d) => d.dispose());
		this._disposables = [];
	}
}

