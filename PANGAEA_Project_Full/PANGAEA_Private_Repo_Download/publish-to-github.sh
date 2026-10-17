#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
owner='SalvatoreP888'
name="${1:-pangaea-autonomous-world}"
repo="$owner/$name"
command -v git >/dev/null || { echo 'Install Git first.' >&2; exit 1; }
command -v gh >/dev/null || { echo 'Install GitHub CLI: https://cli.github.com/' >&2; exit 1; }
if ! gh auth status >/dev/null 2>&1; then
    gh auth login --hostname github.com --git-protocol https --web
fi
login="$(gh api user --jq .login)"
[[ "$login" == "$owner" ]] || { echo "Authenticated as $login, expected $owner" >&2; exit 1; }
if gh repo view "$repo" --json name --jq .name >/dev/null 2>&1; then
    echo "Repo $repo already exists. Refusing to overwrite." >&2; exit 1
fi
if [[ ! -d .git ]]; then
    git init -b main
    git config user.name "$owner"
    git config user.email '130804547+SalvatoreP888@users.noreply.github.com'
    git add -A
    git commit -m 'Initial import: PANGAEA depth 0.2 and autonomous-agent handoff'
fi
[[ "$(git branch --show-current)" == 'main' ]] || { echo 'Expected main branch.' >&2; exit 1; }
if git remote | grep -qx origin; then echo 'An origin remote already exists.' >&2; exit 1; fi
[[ -z "$(git status --porcelain)" ]] || { echo 'Uncommitted changes exist.' >&2; exit 1; }
gh repo create "$repo" --private --source . --remote origin --push --description 'PANGAEA: autonomous civilization simulation and development handoff'
privacy="$(gh api "repos/$repo" --jq .private)"
[[ "$privacy" == true ]] || { echo 'Could not verify private repo. Review settings immediately.' >&2; exit 1; }
echo "SUCCESS: private repository verified at https://github.com/$repo"
