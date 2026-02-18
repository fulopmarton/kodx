# kodx - Code Xray Extension

A VS Code extension that opens a side panel showing the resolved implementations of every function called inside the function your cursor is in.

## Project Overview

**Project Type**: VS Code Extension (TypeScript)  
**Purpose**: Enable users to visualize function implementations in a dedicated Xray panel  
**Status**: Fully implemented and functional  
**Package Manager**: pnpm  
**Key Technology**: Shiki for syntax highlighting with theme matching

## Core Architecture

### Implemented Components

1. **Function Parser** (`src/parser.ts`)
   - Detects the enclosing function where the cursor is located using document symbols
   - Extracts all function calls within that enclosing function
   - Parses function definitions with brace-matching for accurate content extraction
   - Handles TypeScript, TSX, JavaScript, and JSX

2. **Definition Resolver** (`src/resolver.ts`)
   - Resolves function definitions using VS Code's workspace symbol provider
   - Falls back to searching within the current document
   - Extracts complete function content from source files
   - Creates clickable navigation URIs for each definition

3. **Xray Panel** (`src/panel.ts`)
   - Singleton webview panel that displays function implementations
   - Auto-tracks cursor movement and updates panel content automatically
   - Implements scroll-to-call on hover over function names
   - Provides click-to-navigate to function source location
   - Supports bidirectional communication between webview and extension

4. **Syntax Highlighter** (`src/highlighter.ts`)
   - Uses Shiki to provide theme-matched syntax highlighting
   - Dynamically loads VS Code's active color theme
   - Parses JSONC theme files (strips comments and trailing commas)
   - Supports multiple languages: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, C#, JSON
   - Re-initializes when theme changes to maintain consistent appearance

5. **Extension Entry Point** (`src/extension.ts`)
   - Registers the `kodx.xray` command (keyboard: Alt+X)
   - Sets up cursor tracking to auto-update the panel
   - Listens for theme changes and refreshes highlighting
   - Manages lifecycle and disposal of resources

## File Structure

```
src/
├── extension.ts      # Extension activation and command registration
├── panel.ts          # XrayPanel webview management and HTML generation
├── parser.ts         # Function call detection and AST parsing
├── resolver.ts       # Function definition resolution across workspace
├── highlighter.ts    # Shiki-based syntax highlighting with theme matching
└── test/             # Test files
```

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions (camelCase for variables/functions, PascalCase for classes)
- Add JSDoc comments for public APIs and complex logic
- Keep functions focused and single-purpose
- Use async/await for asynchronous operations
- Dispose of resources properly in `_disposables` arrays

### Architecture Principles

- **Singleton Pattern**: XrayPanel uses getInstance() to maintain a single panel instance
- **Event-Driven**: Responds to cursor movement, theme changes, and webview messages
- **Lazy Initialization**: Shiki highlighter is created on-demand and disposed when themes change
- **Resource Management**: All disposables are tracked and cleaned up properly

### Working with the Webview

- The panel HTML is generated dynamically in `_buildHtml()`
- Communication between webview and extension uses `postMessage` API
- Navigation messages include `uri` and `line` to jump to source locations
- The webview retains context when hidden to preserve state

### Adding Language Support

To add syntax highlighting for a new language:
1. Add the language mapping in `LANG_MAP` in `highlighter.ts`
2. Ensure the language is supported by Shiki
3. Update the activation events in `package.json` if needed for activation on that language

### Testing

- Use `pnpm test` to run the test suite
- Tests run in the VS Code Extension Test environment
- The `pretest` script automatically compiles and lints before testing
- Add tests in `src/test/` directory following existing patterns

## Development Workflow

### Setup
```bash
pnpm install          # Install dependencies
pnpm run compile      # Compile TypeScript
pnpm run watch        # Watch mode for development
```

### Running and Debugging
- Press **F5** in VS Code to launch Extension Development Host
- The extension activates on TypeScript, JavaScript, TSX, and JSX files
- Use **Alt+X** to open the Xray panel
- Set breakpoints in source files for debugging

### Before Committing
```bash
pnpm run lint         # Run ESLint
pnpm run compile      # Ensure compilation succeeds
pnpm test             # Run test suite
```

### Publishing
```bash
pnpm run vscode:prepublish  # Prepare for publishing (compiles)
vsce package                # Create .vsix package
```

## Known Limitations

- Semantic token colors from the language server are not replicated
- Only TextMate grammar colors from themes are matched
- Function resolution depends on VS Code's language server being active
- Requires VS Code 1.109.0 or higher

## Common Tasks

### Modifying the Panel Appearance
- Edit the HTML template in `panel.ts` `_buildHtml()` method
- Update inline CSS styles in the `<style>` tag
- Test with different color themes (dark/light)

### Changing Function Detection Logic
- Modify `findEnclosingFunctionRange()` in `parser.ts`
- Adjust `parseFunctionCallsInRange()` for different call patterns
- Update the document symbol filtering logic

### Improving Function Resolution
- Enhance `resolveFunctionDefinition()` in `resolver.ts`
- Add fallback strategies for different module systems
- Handle edge cases like method chaining or nested calls
