# claude-tokens

Claude Code token usage per repo. Each run copies new usage from the transcripts in `~/.claude/projects` into a local ledger, which keeps it after Claude Code deletes them.

Needs macOS and Python 3.11 or newer. Not affiliated with Anthropic.

## Install

Clone the repo and link the script into a folder on your `PATH`:

```sh
git clone https://github.com/kridijaw/claude-tokens.git
ln -s "$PWD/claude-tokens/bin/claude-tokens" ~/.local/bin/
```

## Usage

```sh
claude-tokens                 # table per repo
claude-tokens --html          # write and open a local HTML report
claude-tokens --check-prices  # use today's prices from the Claude pricing page
```

## Groups

Repos are grouped by the folder that contains them: `~/code/clients/shop` is repo `shop` in group `~/code/clients`. Repos that have been moved or deleted cannot be detected this way, so their subfolders show up as separate repos.

To choose the groups yourself, create `~/.config/claude-tokens/config.json`. It expects repos at `root/folder/repo`. Every key is optional, but `groups` needs `root`.

```json
{
  "root": "~/code",
  "groups": {"clients": "work", "agency-old": "work", "hobby": "personal"},
  "renamed": {"work/shop-old": "shop"},
  "gaps": [["2026-01-05", "2026-01-18"]]
}
```

| Key | Meaning |
|---|---|
| `root` | Folder that holds the group folders. Usage outside it is left out of the table and is "other" in the HTML report. |
| `groups` | Folder name to group label. Several folders can share a label, and unlisted folders count as outside `root`. Without it, every folder under `root` is a group. |
| `renamed` | `group/old-name` to new name, using the group label. Usage is combined if the new name already exists in the group. |
| `gaps` | First and last day of periods without transcripts, for the HTML report. |

For repos directly in `~/code`, leave the file out, or use `"root": "~"` with `"groups": {"code": "code"}`.

Config changes also apply to past usage.

## Footprint

The energy, CO2 and water figures in the HTML report are explained in [docs/footprint.md](docs/footprint.md).
