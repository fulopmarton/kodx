import * as vscode from 'vscode';
import { parseFunctionCalls } from './parser';
import { resolveFunctionDefinition } from './resolver';

/**
 * Decoration provider for inline code display
 */
export class FunctionDecorationProvider {
	private decorationType: vscode.TextEditorDecorationType;
	private inlineDecorations = new Map<vscode.TextEditor, vscode.Range[]>();
	private isEnabled = true;

	constructor() {
		this.decorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: new vscode.ThemeColor('editor.background'),
			border: '1px solid ' + new vscode.ThemeColor('editor.lineHighlightBorder'),
			isWholeLine: false,
			opacity: '0.8',
		});
	}

	/**
	 * Update decorations for active editor
	 */
	async updateDecorations(editor: vscode.TextEditor | undefined): Promise<void> {
		if (!editor || !this.isEnabled) {
			return;
		}

		const document = editor.document;
		const decorations: vscode.DecorationOptions[] = [];

		try {
			// Parse all function calls in document
			const calls = parseFunctionCalls(document);

			// Limit to first 50 function calls to avoid performance issues
			const limitedCalls = calls.slice(0, 50);

			for (const call of limitedCalls) {
				// Check if we should show inline decoration
				const shouldShow = await this.shouldShowInlineCode(call.name, document);
				
				if (shouldShow) {
					const definition = await resolveFunctionDefinition(call.name, document);
					
					if (definition) {
						const contentLines = definition.content.split('\n');
						const preview = contentLines.slice(0, 3).join(' ').substring(0, 100);

						decorations.push({
							range: call.range,
							renderOptions: {
								after: {
									contentText: ` → ${preview}...`,
									color: new vscode.ThemeColor('editorCodeLens.foreground'),
									fontStyle: 'italic',
								},
							},
						});
					}
				}
			}

			editor.setDecorations(this.decorationType, decorations);
			this.inlineDecorations.set(editor, decorations.map((d) => d.range));
		} catch (error) {
			console.error('Error updating decorations:', error);
		}
	}

	/**
	 * Determine if we should show inline code for this function
	 */
	private async shouldShowInlineCode(functionName: string, document: vscode.TextDocument): Promise<boolean> {
		// Check configuration
		const config = vscode.workspace.getConfiguration('kodx');
		const enabled = config.get<boolean>('enableInlineDecoration', true);
		
		if (!enabled) {
			return false;
		}

		// Don't show for very common functions
		const commonFunctions = new Set(['map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every']);
		return !commonFunctions.has(functionName);
	}

	/**
	 * Clear all decorations
	 */
	clearDecorations(editor: vscode.TextEditor): void {
		editor.setDecorations(this.decorationType, []);
		this.inlineDecorations.delete(editor);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.decorationType.dispose();
		this.inlineDecorations.clear();
	}

	/**
	 * Enable decorations
	 */
	enable(): void {
		this.isEnabled = true;
	}

	/**
	 * Disable decorations
	 */
	disable(): void {
		this.isEnabled = false;
	}

	/**
	 * Check if decorations are enabled
	 */
	getIsEnabled(): boolean {
		return this.isEnabled;
	}
}

/**
 * Codelens provider for function definitions
 */
export class FunctionCodeLensProvider implements vscode.CodeLensProvider {
	private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

	provideCodeLenses(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		const lenses: vscode.CodeLens[] = [];

		try {
			const calls = parseFunctionCalls(document);

			// Add codelens for first 20 calls
			for (const call of calls.slice(0, 20)) {
				const lens = new vscode.CodeLens(call.range, {
					title: 'Peek Definition',
					command: 'kodx.peekDefinition',
					arguments: [document.uri, call.range.start, call.name],
				});
				lenses.push(lens);
			}
		} catch (error) {
			console.error('Error in code lens provider:', error);
		}

		return lenses;
	}

	refresh(): void {
		this.onDidChangeCodeLensesEmitter.fire();
	}

	dispose(): void {
		this.onDidChangeCodeLensesEmitter.dispose();
	}
}
