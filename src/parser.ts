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
