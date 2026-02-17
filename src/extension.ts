import * as vscode from 'vscode';
import { FunctionHoverProvider } from './hover';
import { FunctionDecorationProvider, FunctionCodeLensProvider } from './decoration';
import { XrayPanel } from './panel';

let decorationProvider: FunctionDecorationProvider;
let codeLensProvider: FunctionCodeLensProvider;

export function activate(context: vscode.ExtensionContext) {
	console.log('Activating kodx - Code Xray extension');

	decorationProvider = new FunctionDecorationProvider();
	codeLensProvider = new FunctionCodeLensProvider();

	// ── Hover provider ──────────────────────────────────────────────────────
	const hoverProvider = new FunctionHoverProvider();
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
			hoverProvider
		)
	);

	// ── CodeLens provider ───────────────────────────────────────────────────
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
			codeLensProvider
		)
	);

	// ── Command: kodx.xray ─────────────────────────────────────────────────
	// Opens (or focuses) the Xray panel beside the editor and immediately
	// resolves the function call under the cursor.
	context.subscriptions.push(
		vscode.commands.registerCommand('kodx.xray', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			const panel = XrayPanel.getInstance(context);
			await panel.updateForEditor(editor);
		})
	);

	// ── Command: kodx.peekDefinition ──────────────────────────────────────
	// Triggers VS Code's built-in inline peek widget (the hunk-style overlay
	// that appears directly below the call in the editor).
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'kodx.peekDefinition',
			async (uri?: vscode.Uri, position?: vscode.Position) => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					return;
				}
				const pos = position ?? editor.selection.active;
				// Reveal inline peek widget
				await vscode.commands.executeCommand(
					'editor.action.peekDefinition',
					uri ?? editor.document.uri,
					pos
				);
			}
		)
	);

	// ── Command: kodx.toggleInlineCode ────────────────────────────────────
	context.subscriptions.push(
		vscode.commands.registerCommand('kodx.toggleInlineCode', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			if (decorationProvider.getIsEnabled()) {
				decorationProvider.disable();
				decorationProvider.clearDecorations(editor);
				vscode.window.showInformationMessage('kodx: Inline indicators disabled');
			} else {
				decorationProvider.enable();
				await decorationProvider.updateDecorations(editor);
				vscode.window.showInformationMessage('kodx: Inline indicators enabled');
			}
		})
	);

	// ── Cursor tracking → auto-update Xray panel ──────────────────────────
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(async (event) => {
			if (XrayPanel.isOpen()) {
				const panel = XrayPanel.getInstance(context);
				await panel.updateForEditor(event.textEditor);
			}
		})
	);

	// ── Editor/document change → refresh decorations ─────────────────────
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			decorationProvider.updateDecorations(editor);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document) {
				decorationProvider.updateDecorations(editor);
			}
		})
	);

	// Initial decoration pass
	decorationProvider.updateDecorations(vscode.window.activeTextEditor);

	console.log('kodx activated');
}

export function deactivate() {
	decorationProvider?.dispose();
	codeLensProvider?.dispose();
}

