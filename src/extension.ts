// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FunctionHoverProvider, FunctionInlineProvider } from './hover';
import { FunctionDecorationProvider, FunctionCodeLensProvider } from './decoration';

let decorationProvider: FunctionDecorationProvider;
let codeLensProvider: FunctionCodeLensProvider;

export function activate(context: vscode.ExtensionContext) {
	console.log('Activating kodx - Code Xray extension');

	// Initialize providers
	decorationProvider = new FunctionDecorationProvider();
	codeLensProvider = new FunctionCodeLensProvider();

	// Register hover provider for TypeScript/JavaScript
	const hoverProvider = new FunctionHoverProvider();
	const hoverDisposable = vscode.languages.registerHoverProvider(
		['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
		hoverProvider
	);
	context.subscriptions.push(hoverDisposable);

	// Register code lens provider
	const codeLensDisposable = vscode.languages.registerCodeLensProvider(
		['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
		codeLensProvider
	);
	context.subscriptions.push(codeLensDisposable);

	// Register command: Peek Definition
	const peekDefinitionCommand = vscode.commands.registerCommand(
		'kodx.peekDefinition',
		async (uri: vscode.Uri, position: vscode.Position, functionName: string) => {
			const document = await vscode.workspace.openTextDocument(uri);
			await FunctionInlineProvider.peekDefinition(document, position);
		}
	);
	context.subscriptions.push(peekDefinitionCommand);

	// Register command: Toggle inline decorations
	const toggleCommand = vscode.commands.registerCommand('kodx.toggleInlineCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			if (decorationProvider.getIsEnabled()) {
				decorationProvider.disable();
				decorationProvider.clearDecorations(editor);
				vscode.window.showInformationMessage('Inline decorations disabled');
			} else {
				decorationProvider.enable();
				await decorationProvider.updateDecorations(editor);
				vscode.window.showInformationMessage('Inline decorations enabled');
			}
		}
	});
	context.subscriptions.push(toggleCommand);

	// Update decorations when editor changes
	vscode.window.onDidChangeActiveTextEditor(
		(editor) => {
			decorationProvider.updateDecorations(editor);
		},
		null,
		context.subscriptions
	);

	// Update decorations when document changes
	vscode.workspace.onDidChangeTextDocument(
		(event) => {
			if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
				decorationProvider.updateDecorations(vscode.window.activeTextEditor);
			}
		},
		null,
		context.subscriptions
	);

	// Update decorations on initial load
	if (vscode.window.activeTextEditor) {
		decorationProvider.updateDecorations(vscode.window.activeTextEditor);
	}

	console.log('kodx extension activated successfully');
}

export function deactivate() {
	console.log('Deactivating kodx extension');
	decorationProvider?.dispose();
	codeLensProvider?.dispose();
}
