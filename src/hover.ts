import * as vscode from 'vscode';
import { resolveFunctionDefinition, formatFunctionContent } from './resolver';

/**
 * Hover provider that shows function implementation on hover
 */
export class FunctionHoverProvider implements vscode.HoverProvider {
	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Hover | null> {
		try {
			// Get the word at cursor position
			const range = document.getWordRangeAtPosition(position);
			if (!range) {
				return null;
			}

			const word = document.getText(range);

			// Skip very short words
			if (word.length < 2) {
				return null;
			}

			// Check if next character is an opening parenthesis (indicating a function call)
			const nextPos = new vscode.Position(range.end.line, range.end.character);
			if (nextPos.character >= document.lineAt(nextPos.line).text.length) {
				return null;
			}

			const nextChar = document.lineAt(nextPos.line).text[nextPos.character];
			if (nextChar !== '(') {
				return null;
			}

			// Try to resolve the function definition
			const definition = await resolveFunctionDefinition(word, document);
			if (!definition) {
				return null;
			}

			// Format the content for display
			const formatted = formatFunctionContent(definition.content, 20);
			
			// Create markdown content
			const markdownContent = new vscode.MarkdownString(
				`**Function:** \`${definition.name}\`\n\n` +
				`**Definition:** [${definition.uri.fsPath}](${definition.uri.fsPath})\n\n` +
				'```typescript\n' +
				formatted +
				'\n```'
			);
			
			markdownContent.isTrusted = true;
			
			return new vscode.Hover(markdownContent, range);
		} catch (error) {
			console.error('Error in hover provider:', error);
			return null;
		}
	}
}

/**
 * Alternative: Inline hover with peek support
 */
export class FunctionInlineProvider {
	static async peekDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<void> {
		try {
			// Get the word at cursor position
			const range = document.getWordRangeAtPosition(position);
			if (!range) {
				return;
			}

			const word = document.getText(range);

			// Resolve definition
			const definition = await resolveFunctionDefinition(word, document);
			if (!definition) {
				vscode.window.showWarningMessage(`Could not find definition for "${word}"`);
				return;
			}

			// Execute the "Go to Definition" command
			await vscode.commands.executeCommand(
				'vscode.executeDefinitionProvider',
				definition.uri,
				definition.range.start
			);

			// Also open the file and show the definition
			const doc = await vscode.workspace.openTextDocument(definition.uri);
			await vscode.window.showTextDocument(doc, {
				selection: definition.range,
			});
		} catch (error) {
			console.error('Error in peek definition:', error);
			vscode.window.showErrorMessage('Failed to peek function definition');
		}
	}
}
