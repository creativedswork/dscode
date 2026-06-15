## ADDED Requirements

### Requirement: edit tool runs syntax validation after successful apply

After successfully applying an edit batch to a file, the `edit` tool SHALL run a syntax validation check on the resulting file content when the file extension is one of: `.js`, `.ts`, `.jsx`, `.tsx`, `.css`, `.html`, `.json`. The syntax check result SHALL be included in the edit response as `syntax_check`. The syntax check SHALL NOT block the edit — the file is written regardless of validation outcome.

#### Scenario: Syntax check passes on valid JavaScript
- **WHEN** `edit` successfully modifies a `.js` file with syntactically valid content
- **THEN** the response SHALL include `syntax_check: { valid: true }`

#### Scenario: Syntax check fails on invalid JavaScript
- **WHEN** `edit` successfully modifies a `.js` file producing content with `Unexpected token ':'` at line 470
- **THEN** the response SHALL include `syntax_check: { valid: false, errors: [{ line: 470, message: "Unexpected token ':'" }] }`
- **AND** the file SHALL still be written to disk with the edited content

#### Scenario: Syntax check skipped for non-code files
- **WHEN** `edit` successfully modifies a `.md`, `.txt`, or `.yaml` file
- **THEN** the response SHALL NOT include `syntax_check`

### Requirement: JavaScript/JSX syntax validation uses esbuild

For `.js` and `.jsx` files, the syntax check SHALL use `esbuild.transformSync` with the appropriate loader (`"js"` or `"jsx"`). The transform output SHALL be discarded — only the parse step matters. `esbuild.transformSync` SHALL throw on syntax errors; the thrown error SHALL be caught and normalized into `syntax_check.errors`.

#### Scenario: esbuild rejects syntax error with line number
- **WHEN** `edit` modifies a `.js` file producing `const x = { y: };`
- **THEN** `syntax_check.valid` SHALL be `false`
- **AND** `syntax_check.errors[0]` SHALL include a `line` number and a `message` describing the syntax error

#### Scenario: esbuild accepts valid JS code
- **WHEN** `edit` modifies a `.js` file producing syntactically valid code
- **THEN** `syntax_check.valid` SHALL be `true`

#### Scenario: esbuild accepts valid JSX code
- **WHEN** `edit` modifies a `.jsx` file producing syntactically valid JSX code
- **THEN** `syntax_check.valid` SHALL be `true`

### Requirement: TypeScript/TSX syntax validation uses TypeScript compiler

For `.ts` and `.tsx` files, the syntax check SHALL use `ts.createSourceFile` with `ScriptTarget.Latest` and the appropriate `ScriptKind` (`TS` or `TSX`). The `setParentNodes` option SHALL be `false` to skip AST parent linking. The function SHALL NOT perform type checking — only syntax parsing. On parse failure, the thrown Diagnostic SHALL be caught and normalized into `syntax_check.errors`.

#### Scenario: ts.createSourceFile rejects syntax error
- **WHEN** `edit` modifies a `.ts` file producing `const x: = 5;`
- **THEN** `syntax_check.valid` SHALL be `false`
- **AND** `syntax_check.errors[0]` SHALL include a `line` number and a `message` describing the syntax error

#### Scenario: ts.createSourceFile accepts valid TS code
- **WHEN** `edit` modifies a `.ts` file producing syntactically valid TypeScript code
- **THEN** `syntax_check.valid` SHALL be `true`

#### Scenario: ts.createSourceFile accepts valid TSX code
- **WHEN** `edit` modifies a `.tsx` file producing syntactically valid TSX code
- **THEN** `syntax_check.valid` SHALL be `true`

#### Scenario: ts.createSourceFile does NOT flag type errors
- **WHEN** `edit` modifies a `.ts` file producing `const x: number = "hello";` (type mismatch but valid syntax)
- **THEN** `syntax_check.valid` SHALL be `true`

### Requirement: JSON syntax validation uses JSON.parse

For `.json` files, the syntax check SHALL use `JSON.parse`. If parsing succeeds, `valid` SHALL be `true`. If parsing fails, `valid` SHALL be `false` and the error SHALL include the parser's error message.

#### Scenario: JSON.parse succeeds on valid JSON
- **WHEN** `edit` modifies a `.json` file producing valid JSON content
- **THEN** `syntax_check.valid` SHALL be `true`

#### Scenario: JSON.parse fails on trailing comma
- **WHEN** `edit` modifies a `.json` file producing content with a trailing comma
- **THEN** `syntax_check.valid` SHALL be `false`
- **AND** `syntax_check.errors[0].message` SHALL describe the parse error

### Requirement: CSS syntax validation uses esbuild

For `.css` files, the syntax check SHALL use `esbuild.transformSync` with loader `"css"`. The transform output SHALL be discarded — only the parse step matters. `esbuild.transformSync` SHALL throw on syntax errors (unbalanced braces, malformed rules); the thrown error SHALL be caught and normalized into `syntax_check.errors`.

#### Scenario: CSS check passes on valid rules
- **WHEN** `edit` modifies a `.css` file producing content with balanced braces and valid rules
- **THEN** `syntax_check.valid` SHALL be `true`

#### Scenario: CSS check fails on unbalanced braces
- **WHEN** `edit` modifies a `.css` file producing content with a missing closing `}`
- **THEN** `syntax_check.valid` SHALL be `false`
- **AND** `syntax_check.errors[0]` SHALL indicate the CSS syntax error

### Requirement: HTML syntax validation checks tag balance

For `.html` files, the syntax check SHALL validate that opening and closing tags are balanced for structural elements (`<div>`, `<section>`, `<body>`, `<head>`, `<html>`, `<main>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<form>`, `<table>`, `<ul>`, `<ol>`, `<li>`). Void elements (`<br>`, `<img>`, `<input>`, `<meta>`, `<link>`, `<hr>`) SHALL be excluded from balance checks.

#### Scenario: HTML check passes on balanced tags
- **WHEN** `edit` modifies a `.html` file producing content with properly nested and balanced tags
- **THEN** `syntax_check.valid` SHALL be `true`

#### Scenario: HTML check fails on unclosed div
- **WHEN** `edit` modifies a `.html` file producing content with an unclosed `<div>`
- **THEN** `syntax_check.valid` SHALL be `false`
- **AND** `syntax_check.errors[0]` SHALL identify the unclosed `<div>` tag

### Requirement: Syntax check does not block or rollback the edit

The syntax validation SHALL run after the file has been written to disk. A failed syntax check SHALL NOT roll back the edit, SHALL NOT restore from snapshot, and SHALL NOT prevent the edit response from indicating success. The syntax check is purely informational.

#### Scenario: Failed syntax check still reports edit success
- **WHEN** `edit` successfully applies operations but syntax validation fails
- **THEN** the response SHALL indicate the edit was applied successfully
- **AND** the response SHALL include `syntax_check: { valid: false, ... }` as an additional informational field
