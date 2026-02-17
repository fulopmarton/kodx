# kodx - Code Xray

A VS Code extension that inlines function calls to visually show their implementation. "Code xray" lets you see through function calls and understand what's happening inside them without navigating away from your current code.

## Features

- **Inline Function Display**: Hover over or select a function call to see its implementation inlined
- **Code Understanding**: Visualize what functions do without context switching
- **Quick Peek**: Get instant insights into function behavior
- **Multi-language Support**: Works across various programming languages

## Requirements

VS Code 1.109.0 or higher

## How It Works

The extension works by:
1. Detecting function calls in your code
2. Finding the function definition in your workspace
3. Displaying the function body inline for quick reference

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

- Initial version - core functionality under development

## Release Notes

### 0.0.1

Initial project setup - foundation for inline function call visualization

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
