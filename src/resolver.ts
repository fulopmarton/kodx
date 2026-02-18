import * as vscode from 'vscode';
import { FunctionDefinition } from './parser';

/**
 * Resolve function definition by searching workspace
 */
export async function resolveFunctionDefinition(
	functionName: string,
	sourceDocument: vscode.TextDocument
): Promise<FunctionDefinition | null> {
	try {
		// Search for function definition using workspace symbols
		const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
			'vscode.executeWorkspaceSymbolProvider',
			functionName
		);

		if (!symbols || symbols.length === 0) {
			// Fallback: search in current file
			return findDefinitionInDocument(sourceDocument, functionName);
		}

		// Filter for function symbols
		const functionSymbols = symbols.filter(
			(s) =>
				s.kind === vscode.SymbolKind.Function ||
				s.kind === vscode.SymbolKind.Method
		);

		if (functionSymbols.length === 0) {
			return null;
		}

		// Use the first matching symbol
		const symbol = functionSymbols[0];
		const uri = symbol.location.uri;
		const range = symbol.location.range;

		// Read the function content
		const doc = await vscode.workspace.openTextDocument(uri);
		const content = extractFunctionContent(doc, range.start.line)
			?? doc.getText(new vscode.Range(range.start, range.end));

		if (!content) {
			return null;
		}

		return {
			name: functionName,
			uri,
			range,
			content,
			startLine: range.start.line,
			endLine: range.end.line,
		};
	} catch (error) {
		console.error('Error resolving function definition:', error);
		return null;
	}
}

/**
 * Find function definition in a document
 */
function findDefinitionInDocument(
	document: vscode.TextDocument,
	functionName: string
): FunctionDefinition | null {
	const text = document.getText();
	
	// Match function declarations: function name(...) { or name(...) {
	const patterns = [
		new RegExp(`function\\s+${escapeRegex(functionName)}\\s*\\(`, 'g'),
		new RegExp(`const\\s+${escapeRegex(functionName)}\\s*=.*=>`, 'g'),
		new RegExp(`${escapeRegex(functionName)}\\s*\\(.*\\)\\s*{`, 'g'),
		new RegExp(`${escapeRegex(functionName)}\\s*\\(.*\\)\\s*:\\s*`, 'g'), // TypeScript typed
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(text)) !== null) {
			const startPos = document.positionAt(match.index);
			const lineNum = startPos.line;
			
			// Extract full function content
			const content = extractFunctionContent(document, lineNum);
			if (content) {
				return {
					name: functionName,
					uri: document.uri,
					range: new vscode.Range(startPos, startPos),
					content,
					startLine: lineNum,
					endLine: lineNum + content.split('\n').length - 1,
				};
			}
		}
	}

	return null;
}

/**
 * Extract function content including body
 */
function extractFunctionContent(document: vscode.TextDocument, startLine: number): string | null {
	let braceCount = 0;
	let foundBrace = false;
	const lines: string[] = [];
	// Track whether we've started collecting (to include signature lines before opening brace)
	let started = false;

	for (let i = startLine; i < document.lineCount; i++) {
		const line = document.lineAt(i).text;
		
		// Start collecting from the first line
		if (!started) {
			started = true;
			lines.push(line);
		}
		
		for (const char of line) {
			if (char === '{') {
				foundBrace = true;
				braceCount++;
			} else if (char === '}') {
				braceCount--;
				if (foundBrace && braceCount === 0) {
					// Found end of function - push the current line with closing brace
					if (started && !lines[lines.length - 1].includes(line)) {
						lines.push(line);
					}
					const content = lines.join('\n');
					return content.length > 0 ? content : null;
				}
			}
		}

		// Continue adding lines after first line
		if (started && i > startLine) {
			lines.push(line);
		}
	}

	return null;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


