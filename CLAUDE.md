# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `i18n-tool`, a CLI tool for managing i18n (internationalization) YAML translation files. It tracks changes via snapshots and synchronizes translations from a base language (typically Chinese) to target languages (English, Japanese, etc.).

## Common Commands

### Development
```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Run CLI directly with ts-node
npm start             # Run compiled CLI from dist/
npm test               # Run all tests
npm run lint           # Run ESLint
npm run typecheck      # Type check without emitting files
```

### Testing
```bash
# Run all tests
npm test

# Run specific test group
npx ts-node src/__tests__/config/case-1-config-loading/test.ts
npx ts-node src/__tests__/sync/case-1-sync-new-keys/test.ts

# Run snapshot test
npx ts-node src/__tests__/snapshot/case-1-snapshot-basic/test.ts
```

### Building
```bash
npm run build          # Compiles to dist/ directory
node dist/index.js    # Run the compiled CLI
```

## Architecture Overview

### Core Workflow

The sync process follows this pattern:

1. **LocaleScanner** scans files using glob patterns with named wildcards (`(* as name)`)
2. **SnapshotManager** reads/writes snapshot files that store previous base language state
3. **DiffEngine** compares current base language files against snapshot to detect changes
4. **SyncEngine** orchestrates the workflow and updates target language files

### Pattern Syntax

The tool uses a custom pattern syntax for scanning locale files:

```javascript
scanPatterns: [
  'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
]
```

- `(* as name)` captures a path segment and assigns it to variable `name`
- The scanner converts patterns to regex for variable extraction and to glob for file matching
- Extracted variables are stored in `LocaleFile.variables` and used for snapshot path resolution

### Key Components

**Core Classes:**
- `LocaleScanner` - Parses patterns, scans files, extracts variables from paths
- `SnapshotManager` - Manages snapshot CRUD operations with variable substitution
- `DiffEngine` - Compares snapshot vs current data to find added/changed/deleted keys
- `SyncEngine` - Orchestrates sync workflow, handles filtering and file updates
- `YamlHandler` - Reads/writes YAML files with consistent formatting

**Configuration:**
- `config/config-loader.ts` - Loads `.i18ntoolrc.js`, merges with defaults, validates with Zod
- `config/config-schema.ts` - Zod schema for config validation
- `config/defaults.ts` - Default configuration values

**Utilities:**
- `utils/logger.ts` - Formatted console output with Chinese log messages
- `utils/file-utils.ts` - Path manipulation, file existence checks

### Directory Structure

```
src/
├── index.ts              # CLI entry point (Commander setup)
├── types.ts              # TypeScript interfaces
├── config/               # Configuration management
│   ├── config-loader.ts  # Load, merge, validate config
│   ├── config-schema.ts  # Zod validation schema
│   └── defaults.ts       # Default config values
├── core/                 # Core business logic
│   ├── scanner.ts        # Pattern parsing & file scanning
│   ├── snapshot-manager.ts
│   ├── diff-engine.ts
│   ├── sync-engine.ts
│   └── yaml-handler.ts
├── utils/                # Shared utilities
│   ├── logger.ts
│   └── file-utils.ts
├── commands/             # CLI commands (flat structure)
│   ├── snapshot.ts       # snapshot command
│   └── sync.ts           # sync command
└── __tests__/            # Test suites
    ├── index.ts          # Test runner
    ├── utils.ts          # Test utilities
    ├── config/           # Config tests
    ├── snapshot/        # Snapshot tests
    └── sync/            # Sync tests
```

### Test Structure

Tests are organized by command group (config, snapshot, sync) with numbered cases within each group. Each test case has:
- `source/` - Input files (including config and locale files)
- `expected/` - Expected output state for comparison

Test numbering resets within each group (1, 2, 3...) not cumulative across groups.

### Configuration File

- **Name**: `.i18ntoolrc.js` (in project root where command is run)
- **Search order**: Current directory → parent directories → stops at git root
- **Validation**: Uses Zod with errors like `scanPatterns: Too small: expected array to have >=1 items`

### Important Details

**Snapshot Path Pattern:**
- Uses variables extracted from scan patterns (e.g., `{app}`, `{product}`)
- `{target}` or `{language}` = target language code
- Example: `'{app}/{product}/{target}.yml'` → `shop/widget/en-US.yml`

**App Extraction:**
- First named wildcard in pattern is treated as "app" for grouping
- Falls back to first directory segment if no `(* as app)` pattern

**YAML Format:**
- Files must be flat key-value pairs (no nested objects)
- Values use double quotes, empty strings as `""`
- Keys maintain order from source files

**Sync Behavior:**
- New keys → add empty string `""`
- Changed keys → set to `""`, log old → new
- Deleted keys → remove from target

### Adding New Tests

When adding tests:
1. Group by command (config/snapshot/sync)
2. Number cases starting from 1 within each group
3. Create `source/` with input files and `expected/` with expected output
4. Test case structure should follow existing examples

### Language

- Code comments and JSDoc are in Chinese
- Error messages (throw Error) are in English
- CLI output is in Chinese
- Log messages (console.log) are in Chinese
