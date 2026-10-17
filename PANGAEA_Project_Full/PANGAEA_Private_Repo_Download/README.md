# PANGAEA — An Autonomous World

**Private development repository · Depth v0.2 starting point**

A globe-scale, autonomous civilization simulation. Four founders begin a settlement; their needs, work, relationships, families, ecological constraints and migration shape what happens next. The existing code is a tested research prototype, **not** a finished AAA game.

## Start here

- **`PANGAEA_LOCAL_AGENT_MASTER_PROMPT.md`** — complete autonomous-agent development specification (Living Households first, then coherent world geography, society and selective model reasoning).
- **`HANDOFF_README.md`** — original handoff instructions and file inventory.
- **`pangaea-depth/`** — current v0.2 browser game, source modules, tests, archived scenario output and reproducible save files.
- **`pangaea-depth/docs/`** — research references, architectural notes, QA results and known limitations.
- **`reference/`** — supplied map image used as *visual reference only*.

The contents of the original handoff kit remain byte-for-byte unchanged. Their hashes are recorded in `HANDOFF_MANIFEST.json`. This repository adds publishing helpers, this README and a `.gitignore`.

### Run the existing game

Open `pangaea-depth/index.html` in a browser. For development using Node.js 22 or newer:

```bash
cd pangaea-depth
npm test
npm run build
```

The original QA notes distinguish completed tests from untested browsers, storage conditions and larger populations. Do not treat the project as production-ready without fresh tests.

## Publish as a new private GitHub repository

This lightweight download omits the bundled `.git` directory to reduce the download size. The publishing script creates the initial Git commit locally. Publishing requires the **GitHub CLI** (`gh`) and Git to be installed and authenticated with the intended account. The scripts refuse to overwrite a repository that already exists and verify that the new one is private.

**Windows PowerShell:** Open PowerShell in this folder, then run:

```powershell
.\PUBLISH_TO_GITHUB.ps1
```

If Windows blocks local scripts, use a one-time invocation from PowerShell (no global execution-policy change):

```powershell
powershell -ExecutionPolicy Bypass -File .\PUBLISH_TO_GITHUB.ps1
```

**macOS/Linux:**

```bash
bash ./publish-to-github.sh
```

Both scripts target **`SalvatoreP888/pangaea-autonomous-world`** and will ask you to authenticate with GitHub if needed. They require confirmation that the authenticated account is `SalvatoreP888`. If that name already exists, pass a different repository name as the first script argument.

A successful script creates the remote repository with `--private`, pushes the local `main` branch, and reads the remote privacy setting back through the GitHub API. It does not change your other repositories.

## Repository handling

This is a new project. Do not alter unrelated repositories. Do not publish private reference images or save files publicly. Preserve commits, save compatibility and baseline test evidence when implementing subsequent milestones. No GitHub Actions workflows are enabled by this starter package.
