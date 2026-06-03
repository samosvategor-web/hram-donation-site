---
description: Download a design archive, sync project files into the repo (ignoring uploads), and clean up temp files
argument-hint: <archive-url>
allowed-tools: Bash
---

Sync the project from a downloaded design archive.

Archive URL: $1

Follow these steps exactly:

1. Resolve the repo root with `git rev-parse --show-toplevel` and work from there.
2. Create a temp dir with `mktemp -d`. Download the archive URL into it with `curl -sL`.
   If no URL was provided in `$1`, ask the user for the archive URL and stop.
3. Detect the archive type with `file` and extract it inside the temp dir
   (typically `tar -xzf` for gzip archives).
4. Locate the project payload. The archive contains a top-level folder (e.g. `hram/`)
   with a `project/` subfolder whose contents map to the repo root. Metadata like
   `README.md` and `chats/` that live outside `project/` are NOT part of the website
   and must be ignored.
5. Preview changes with a dry run before applying:
   `rsync -rcn --itemize-changes --exclude='uploads/' "<src>/project/" .`
   ALWAYS exclude the `uploads/` folder. Do NOT use `--delete` — only update and add
   files, never remove existing repo files.
6. Apply the sync: `rsync -rc --exclude='uploads/' "<src>/project/" .`
7. Show `git status --short` so the user sees what changed.
8. Remove ALL temp files/dirs created during this run (`rm -rf` the mktemp dir).
9. Report a concise summary of which files were updated. Do NOT commit or push unless
   the user explicitly asks.
