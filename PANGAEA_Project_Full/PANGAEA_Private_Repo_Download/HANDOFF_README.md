# PANGAEA — Local agent handoff

## Use

Extract this archive into a dedicated local workspace. Open that workspace with your coding agent, then give it the contents of `PANGAEA_LOCAL_AGENT_MASTER_PROMPT.md` as its project instruction. The `.txt` file contains the identical prompt.

The existing project is in `pangaea-depth/`. The agent should inspect its instructions and scripts before running anything. Its documented starting commands are:

```sh
cd pangaea-depth
npm run build
npm test
```

The full prompt directs the agent to audit the actual source, preserve the baseline, implement Living Households first, verify results, and continue through the subsequent milestones with durable checkpoints. A local agent still needs its own file-editing, shell, and browser/testing permissions; research and optional model integration require suitable network access or configured endpoints. The prompt does not create an external scheduling service or keep an agent alive after its session ends.

## Contents

- `PANGAEA_LOCAL_AGENT_MASTER_PROMPT.md` and `.txt`: the complete handoff instruction.
- `pangaea-depth/`: the supplied Depth v0.2 source archive unpacked without modifying its file contents, including its original source, compiled HTML, docs, tests, screenshots, and saved worlds.
- `reference/coastal-settlement-reference.png`: the owner's original visual reference, for study rather than use as a game texture.
- `HANDOFF_MANIFEST.json`: file hashes and baseline source-archive hash.

The mature saved world is `pangaea-depth/saves/seed-481217-after-40-years.json`. The research and QA reports are in `pangaea-depth/docs/`. Treat all historical QA and research statements as claims to reproduce or re-verify, not fresh certification.

This is a development handoff package, not a new gameplay release. No simulation changes were made when packaging it. Repository history, credentials, installed dependencies, a configured local model, and a running dev server are not included.
