# Skills Folder

This folder contains reusable agent skill entrypoints for the profiling demo.

## Current skill

- `profiling-agent.js` — a generic agent launcher that supports one or more skills.

## Usage

Run the profiling skill locally:

```bash
node skills/profiling-agent.js --skill profiling
```

## Adding new skills

To add another skill:

1. Add the new skill definition to `skills/profiling-agent.js`, or split skills into separate files under `skills/`.
2. Update the workflow in `.github/workflows/commit-profiling.yml` to invoke the new skill.
