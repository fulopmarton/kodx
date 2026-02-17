# kodx — Code Xray

See through function calls. **kodx** opens a side panel that shows the resolved implementations of every function called inside the function your cursor is in — syntax-highlighted with your current VS Code theme.

## Features

- **Xray Panel** — Press `Alt+X` to open a side panel listing every function call inside the enclosing function, each expanded to show its full implementation.
- **Auto-tracking** — As you move your cursor into a different function, the panel updates automatically.
- **Scroll-to-call** — Hover your cursor over a function call name and the panel scrolls to its definition and highlights it.
- **Click-to-navigate** — Click any definition in the panel to jump to its source file and line.
- **Theme-matched highlighting** — Syntax colors are loaded from your active VS Code color theme, so the panel looks identical to your editor.
- **Theme change support** — Switch themes and the panel re-renders immediately with the new colors.

## Supported Languages

TypeScript, TSX, JavaScript, JSX (activation).  
Syntax highlighting also covers Python, Go, Rust, Java, C/C++, C#, and JSON.

## Usage

1. Open a TypeScript or JavaScript file.
2. Place your cursor inside a function.
3. Press **`Alt+X`** (or run **kodx: Expand Function at Cursor** from the Command Palette).
4. The Xray panel opens beside your editor showing all called functions.
5. Move your cursor over different function call names to scroll the panel to each one.

## Requirements

- VS Code 1.109.0 or higher
- A TypeScript or JavaScript workspace with a language server that provides document symbols

## Known Issues

- Semantic token colors (from the language server) are not replicated — only TextMate grammar colors are matched.

## Release Notes

### 0.0.1

Initial release — Xray panel with auto-tracking, scroll-to-call, click-to-navigate, and theme-matched Shiki highlighting.
