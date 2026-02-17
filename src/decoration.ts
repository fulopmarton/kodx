import * as vscode from 'vscode';
import { parseFunctionCalls } from './parser';
import { resolveFunctionDefinition } from './resolver';

/**
 * Decoration provider — marks function calls that have a resolvable definition
 * with a subtle gutter indicator so the user knows xray can expand them.
 */
export class FunctionDecorationProvider {
	/** Subtle "xray available" indicator after the function name */
	private readonly _callIndicatorType = vscode.window.createTextEditorDecorationType({
		after: {
			contentText: ' ⊕',
			color: new vscode.ThemeColor('editorCodeLens.foreground'),
			margin: '0 0 0 2px',
		},
	});

	private _isEnabled = true;

	async updateDecorations(editor: vscode.TextEditor | undefined): Promise<void> {
		if (!editor || !this._isEnabled) {
			return;
		}

		const document = editor.document;
		if (!['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(document.languageId)) {
			return;
		}

		const config = vscode.workspace.getConfiguration('kodx');
		if (!config.get<boolean>('enableInlineDecoration', true)) {
			return;
		}

		const calls = parseFunctionCalls(document).slice(0, 50);
		const indicators: vscode.DecorationOptions[] = [];

		for (const call of calls) {
			const definition = await resolveFunctionDefinition(call.name, document);
			if (definition) {
				indicators.push({ range: call.range });
			}
		}

		editor.setDecorations(this._callIndicatorType, indicators);
	}

	clearDecorations(editor: vscode.TextEditor): void {
		editor.setDecorations(this._callIndicatorType, []);
	}

	enable(): void { this._isEnabled = true; }
	disable(): void { this._isEnabled = false; }
	getIsEnabled(): boolean { return this._isEnabled; }

	dispose(): void {
		this._callIndicatorType.dispose();
	}
}

/**
 * CodeLens provider — shows "⊕ xray" above function calls with resolvable definitions.
 */
export class FunctionCodeLensProvider implements vscode.CodeLensProvider {
	private _emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._emitter.event;

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const calls = parseFunctionCalls(document).slice(0, 30);
		return calls.map(
			(call) =>
				new vscode.CodeLens(call.range, {
					title: '⊕ xray',
					command: 'kodx.peekDefinition',
					arguments: [document.uri, call.range.start],
					tooltip: `Peek implementation of ${call.name}`,
				})
		);
	}

	refresh(): void { this._emitter.fire(); }

	dispose(): void { this._emitter.dispose(); }
}

