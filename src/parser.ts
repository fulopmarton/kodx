import * as vscode from 'vscode';

export interface FunctionCall {
	name: string;
	range: vscode.Range;
	line: number;
	character: number;
}

export interface FunctionDefinition {
	name: string;
	uri: vscode.Uri;
	range: vscode.Range;
	content: string;
	startLine: number;
	endLine: number;
}

/**
 * Parse function calls from a document
 */
export function parseFunctionCalls(document: vscode.TextDocument): FunctionCall[] {
	const calls: FunctionCall[] = [];
	const text = document.getText();
	
	// Regex to match function calls - matches word followed by (
	// Handles: functionName(), obj.method(), etc.
	const functionCallRegex = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
	let match;

	while ((match = functionCallRegex.exec(text)) !== null) {
		const functionName = match[1];
		
		// Skip common keywords and built-ins
		if (isKeywordOrBuiltin(functionName)) {
			continue;
		}

		const startPos = match.index;
		const startLine = document.positionAt(startPos).line;
		const startChar = document.positionAt(startPos).character;
		
		// Create range for the function name
		const range = new vscode.Range(
			new vscode.Position(startLine, startChar),
			new vscode.Position(startLine, startChar + functionName.length)
		);

		calls.push({
			name: functionName,
			range,
			line: startLine,
			character: startChar,
		});
	}

	return calls;
}

/**
 * Extract function definition from source code
 */
export function extractFunctionDefinition(
	document: vscode.TextDocument,
	startLine: number
): { content: string; endLine: number } | null {
	const lineCount = document.lineCount;
	let braceCount = 0;
	let startedCapturing = false;
	const lines: string[] = [];

	for (let i = startLine; i < lineCount; i++) {
		const line = document.lineAt(i).text;
		
		for (const char of line) {
			if (char === '{') {
				braceCount++;
				startedCapturing = true;
			} else if (char === '}') {
				braceCount--;
				if (startedCapturing && braceCount === 0) {
					lines.push(line.substring(0, line.indexOf('}') + 1));
					return {
						content: lines.join('\n'),
						endLine: i,
					};
				}
			}
		}

		if (startedCapturing) {
			lines.push(line);
		} else if (line.includes('{')) {
			// Start of function body found
			startedCapturing = true;
			lines.push(line);
		}
	}

	return null;
}

/**
 * Find the range of the function that contains the given position.
 * Uses VS Code's document symbol provider for accuracy.
 */
export async function findEnclosingFunctionRange(
	document: vscode.TextDocument,
	position: vscode.Position
): Promise<vscode.Range | null> {
	try {
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);

		if (!symbols || symbols.length === 0) {
			return findEnclosingFunctionByBraces(document, position);
		}

		// Walk symbol tree to find deepest function/method containing the cursor
		const functionKinds = new Set([
			vscode.SymbolKind.Function,
			vscode.SymbolKind.Method,
			vscode.SymbolKind.Constructor,
		]);

		function searchSymbols(syms: vscode.DocumentSymbol[]): vscode.Range | null {
			let best: vscode.Range | null = null;
			for (const sym of syms) {
				if (sym.range.contains(position)) {
					if (functionKinds.has(sym.kind)) {
						// Prefer deepest (smallest) containing range
						if (!best || rangeSize(sym.range) < rangeSize(best)) {
							best = sym.range;
						}
					}
					// Recurse into children
					const child = searchSymbols(sym.children ?? []);
					if (child && (!best || rangeSize(child) < rangeSize(best))) {
						best = child;
					}
				}
			}
			return best;
		}

		return searchSymbols(symbols) ?? findEnclosingFunctionByBraces(document, position);
	} catch {
		return findEnclosingFunctionByBraces(document, position);
	}
}

function rangeSize(r: vscode.Range): number {
	return (r.end.line - r.start.line) * 10000 + (r.end.character - r.start.character);
}

/**
 * Fallback: find enclosing function by brace-matching upwards from position.
 */
function findEnclosingFunctionByBraces(
	document: vscode.TextDocument,
	position: vscode.Position
): vscode.Range | null {
	const text = document.getText();
	const offset = document.offsetAt(position);
	let depth = 0;
	let closingOffset = -1;

	// Walk forward from cursor to find the matching closing brace
	for (let i = offset; i < text.length; i++) {
		if (text[i] === '{') { depth++; }
		else if (text[i] === '}') {
			if (depth === 0) { closingOffset = i; break; }
			depth--;
		}
	}
	if (closingOffset === -1) { return null; }

	// Walk backward from cursor to find the opening brace
	depth = 0;
	let openingOffset = -1;
	for (let i = offset; i >= 0; i--) {
		if (text[i] === '}') { depth++; }
		else if (text[i] === '{') {
			if (depth === 0) { openingOffset = i; break; }
			depth--;
		}
	}
	if (openingOffset === -1) { return null; }

	// Walk further backward to find 'function' keyword or arrow
	const preamble = text.slice(Math.max(0, openingOffset - 200), openingOffset);
	const fnMatch = preamble.match(/(?:function\s+\w+|\w+\s*(?:=|:)\s*(?:async\s+)?(?:function|\())[^{]*$/);
	if (!fnMatch) { return null; }

	const startOffset = openingOffset - 200 + preamble.lastIndexOf(fnMatch[0]);
	return new vscode.Range(
		document.positionAt(Math.max(0, startOffset)),
		document.positionAt(closingOffset + 1)
	);
}

/**
 * Parse function calls within a specific text range of a document.
 */
export function parseFunctionCallsInRange(
	document: vscode.TextDocument,
	range: vscode.Range
): FunctionCall[] {
	const startOffset = document.offsetAt(range.start);
	const endOffset = document.offsetAt(range.end);
	const rangeText = document.getText().slice(startOffset, endOffset);

	const calls: FunctionCall[] = [];
	const functionCallRegex = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
	let match;

	while ((match = functionCallRegex.exec(rangeText)) !== null) {
		const name = match[1];
		if (isKeywordOrBuiltin(name)) { continue; }

		const absOffset = startOffset + match.index;
		const pos = document.positionAt(absOffset);
		calls.push({
			name,
			range: new vscode.Range(pos, new vscode.Position(pos.line, pos.character + name.length)),
			line: pos.line,
			character: pos.character,
		});
	}

	return calls;
}

/**
 * Check if a name is a JavaScript keyword or built-in function
 */
function isKeywordOrBuiltin(name: string): boolean {
	const keywords = new Set([
		'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
		'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
		'instanceof', 'in', 'of', 'void', 'this', 'class', 'extends', 'super',
		'import', 'export', 'from', 'as', 'default', 'function', 'const', 'let',
		'var', 'async', 'await', 'yield', 'static', 'get', 'set', 'constructor',
		// Built-in objects and functions
		'console', 'window', 'document', 'parseInt', 'parseFloat', 'isNaN',
		'Array', 'Object', 'String', 'Number', 'Boolean', 'Error', 'RegExp',
		'Math', 'Date', 'JSON', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
		'Symbol', 'BigInt', 'Proxy', 'Reflect', 'DataView', 'ArrayBuffer',
		'TypedArray', 'require', 'exports', 'module', 'process', 'global',
		'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout',
	]);

	return keywords.has(name);
}

/**
 * Find matching braces and extract function body
 */
export function extractCodeBlock(source: string, startIndex: number): string {
	let braceCount = 0;
	let foundStart = false;
	let result = '';

	for (let i = startIndex; i < source.length; i++) {
		const char = source[i];

		if (char === '{') {
			foundStart = true;
			braceCount++;
		} else if (char === '}') {
			braceCount--;
			if (foundStart && braceCount === 0) {
				result += char;
				return result;
			}
		}

		if (foundStart) {
			result += char;
		}
	}

	return result;
}
