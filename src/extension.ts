import * as vscode from 'vscode';
import { XrayPanel } from './panel';
import { disposeHighlighter } from './highlighter';

export function activate(context: vscode.ExtensionContext) {
	console.log('Activating kodx - Code Xray extension');

	// ── Command: kodx.xray ─────────────────────────────────────────────────
	// Opens (or focuses) the Xray panel beside the editor and immediately
	// resolves the function calls inside the enclosing function.
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

	// ── Cursor tracking → auto-update Xray panel ──────────────────────────
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(async (event) => {
			if (XrayPanel.isOpen()) {
				const panel = XrayPanel.getInstance(context);
				await panel.updateForEditor(event.textEditor);
			}
		})
	);

	// ── Theme change → re-highlight Xray panel ──────────────────────────
	context.subscriptions.push(
		vscode.window.onDidChangeActiveColorTheme(async () => {
			disposeHighlighter();
			if (XrayPanel.isOpen()) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					const panel = XrayPanel.getInstance(context);
					panel.resetCurrentScope();
					await panel.updateForEditor(editor);
				}
			}
		})
	);

	console.log('kodx activated');
}

export function deactivate() {
	disposeHighlighter();
}

