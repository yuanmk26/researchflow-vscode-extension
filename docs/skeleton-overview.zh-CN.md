# ResearchFlow Extension Skeleton Overview

This document summarizes the current VS Code extension structure and the project directory model.

## Positioning

The extension is a lightweight VS Code entry layer. It is responsible for:

- VS Code commands, tree views, workspace file operations, and webview wiring.
- Minimal project state in `.researchflow/project.json`.
- A placeholder service layer for future ResearchFlow Core calls.

Business logic and AI workflows are intentionally thin in this repository.

## Project Directories

ResearchFlow now treats these root directories as required:

- `References/`
- `Analysis/`
- `Data/`
- `Writing/`

Root-level `Figures/` and `Tables/` are no longer required and are not created for new projects. Existing directories with those names are preserved if users already have them.

Experiment-generated figures and tables belong under each experiment:

```text
Analysis/
  experiment-name/
    scripts/
    figures/
    tables/
```

Writing should cite frozen copies under the writing item:

```text
Writing/
  paper-name/
    figures/
    tables/
```

`Data/` is project-level storage for shared datasets and derived data that may be reused by multiple experiments.

## Important Files

- `src/extension.ts`: extension activation, command registration, tree view registration, and file watchers.
- `src/state/projectManager.ts`: project config loading and required directory/metadata validation.
- `src/views/dataTreeProvider.ts`: Data tree provider and drag-and-drop handling for files under `Data/`.
- `src/views/analysisTreeProvider.ts`: Analysis experiment tree with `scripts`, `figures`, and `tables` groups.
- `src/commands/`: command handlers for project, analysis, data, citation, and caption actions.
- `src/services/coreClient.ts`: placeholder HTTP client for local ResearchFlow Core integration.

## Views

The ResearchFlow activity bar contributes:

- Projects
- References
- Analysis
- Writing
- Data

ResearchFlow Chat is contributed as a webview view in the panel container.

## Build

```bash
npm install
npm run compile
```
