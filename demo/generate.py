#!/usr/bin/env python3
"""Write the example report, from the local ledger with made-up repo names, to demo/site/index.html."""

import importlib.util
import sqlite3
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "demo/site/index.html"
# Given to the biggest repos by API cost, in this order. Smaller repos count as "other".
NAMES = ["storefront", "billing-api", "search-indexer", "pixel-garden", "design-system",
         "recipe-box", "tide-clock", "infra", "dotfiles"]


def main():
    sys.dont_write_bytecode = True
    loader = SourceFileLoader("claude_tokens", str(ROOT / "bin/claude-tokens"))
    tool = importlib.util.module_from_spec(importlib.util.spec_from_loader("claude_tokens", loader))
    loader.exec_module(tool)
    db = sqlite3.connect(f"file:{tool.LEDGER}?mode=ro", uri=True)
    cells, _ = tool.usage(db)
    costs = {}
    for (_, _, repo, _), values in cells.items():
        if repo != ("other", "other"):
            costs[repo] = costs.get(repo, 0) + sum(values[len(tool.TYPES) :])
    ranked = sorted(costs, key=costs.get, reverse=True)
    fake = {repo: (repo[0], name) for repo, name in zip(ranked, NAMES)}
    real = tool.repo_of
    tool.repo_of = lambda cwd: fake.get(real(cwd))
    tool.REPORT = OUT
    tool.subprocess.run = lambda *a, **k: None
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tool.write_report(db)
    db.close()
    OUT.write_text(OUT.read_text().replace("/*AUTOPLAY*/", "play(true);"))


if __name__ == "__main__":
    main()
