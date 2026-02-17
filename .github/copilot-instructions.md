# kodx - Code Xray Extension

A VS Code extension that inlines function calls to visually show their implementation.

## Project Overview

**Project Type**: VS Code Extension (TypeScript)  
**Purpose**: Enable users to visualize function implementations inline when viewing source code  
**Status**: Foundation phase - core architecture setup complete

## Development Guidelines

### Architecture & Core Features

The extension should provide:
- Function call detection and analysis
- AST (Abstract Syntax Tree) parsing for supported languages
- Inline display of function implementations via decorations and hovers
- Support for multi-language codebases (JavaScript, TypeScript, Python, etc.)

### Key Components to Build

1. **Function Parser**: Detect and parse function calls from active editor
2. **Definition Resolver**: Find function definitions in workspace
3. **Inline Renderer**: Display function bodies inline using VS Code decorations/hovers
4. **Language Support**: Add support for multiple programming languages

### File Structure

- `src/extension.ts` - Main extension entry point and command registration
- `src/test/` - Test files for the extension
- `.vscode/` - VS Code configuration and debug settings
- `package.json` - Extension manifest and metadata

### Next Steps

1. Design the core architecture for function detection and resolution
2. Implement basic function parsing for JavaScript/TypeScript
3. Add hover provider to display inline function implementations
4. Create test cases for various scenarios
5. Extend language support incrementally

## Development Workflow

- Use `pnpm` as the package manager
- Build/compile with TypeScript compiler
- Debug using VS Code's built-in debugger (F5)
- Run tests with `pnpm test` or VS Code test tasks
- Bundle is disabled (`unbundled`) for development flexibility
