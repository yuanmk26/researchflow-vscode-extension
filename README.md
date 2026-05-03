# ResearchFlow VS Code Extension

ResearchFlow is a VS Code entry layer for an AI-assisted research workflow. This repository contains the extension shell, project initialization, tree views, and command wiring used to connect local project files with later ResearchFlow Core services.

## Project Layout

New ResearchFlow projects create and validate these root directories:

- `References/`: project references and citation material.
- `Analysis/`: experiments and analysis tasks.
- `Data/`: project-level shared data that can be reused by multiple experiments.
- `Writing/`: writing projects, manuscripts, and frozen copies of cited figures/tables.

Project-level `Figures/` and `Tables/` are no longer part of the required architecture. Experiment outputs should stay with the experiment that produced them:

```text
Analysis/
  experiment-name/
    scripts/
    figures/
    tables/
```

When a writing item cites a figure or table, copy or publish that artifact into the relevant writing folder so the manuscript references a frozen version:

```text
Writing/
  paper-name/
    figures/
    tables/
```

`Data/` remains a project-level directory because datasets are often shared by several experiments and can be large enough that copying them per experiment is undesirable.

## Current Features

- Project initialization through `ResearchFlow: Init Project`.
- Project, References, Analysis, Writing, Data, and Chat views in the ResearchFlow activity bar.
- Analysis experiment creation with per-experiment `scripts`, `figures`, and `tables` groups.
- Data import, folder creation, info sidecar opening, move, delete, and drag-and-drop organization under `Data/`.
- Placeholder backend client for future ResearchFlow Core integration.

## Commands

- `ResearchFlow: Init Project` (`researchflow.initProject`)
- `ResearchFlow: Recommend Citations` (`researchflow.recommendCitations`)
- `ResearchFlow: Draft Caption` (`researchflow.draftCaption`)
- `ResearchFlow: Data Import Data` (`researchflow.data.importData`)
- `ResearchFlow: Data New Data Folder` (`researchflow.data.newDataFolder`)
- `ResearchFlow: Open Data Info` (`researchflow.data.openDataInfo`)
- `ResearchFlow: Move Data File` (`researchflow.data.moveData`)
- `ResearchFlow: Delete Data File` (`researchflow.data.deleteData`)

## Build And Run

1. Install dependencies:

```bash
npm install
```

2. Compile:

```bash
npm run compile
```

3. Start extension debugging:

- Open this repository in VS Code.
- Press `F5` or run the extension launch configuration.
- A new Extension Development Host window opens with ResearchFlow active.

## Notes

- Existing project-level `Figures/` and `Tables/` directories are not deleted automatically.
- The local backend URL is currently a placeholder: `http://127.0.0.1:27182`.
