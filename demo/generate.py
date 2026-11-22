#!/usr/bin/env python3
"""Write the example report, from made-up usage, to demo/site/index.html."""

import importlib.util
import math
import os
import random
import sqlite3
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "demo/site/index.html"
START, END = datetime(2026, 7, 6, tzinfo=timezone.utc), datetime(2026, 11, 21, tzinfo=timezone.utc)
GAP = ("2026-08-08", "2026-08-19")
SPLIT_FROM = datetime(2026, 8, 24, tzinfo=timezone.utc)

REPOS = {
    "work/storefront": (30, "2026-07-06", "2026-11-21"),
    "work/billing-api": (22, "2026-07-06", "2026-11-21"),
    "work/design-system": (9, "2026-07-20", "2026-10-30"),
    "work/search-indexer": (16, "2026-09-07", "2026-11-21"),
    "work/infra": (5, "2026-07-06", "2026-11-21"),
    "personal/recipe-box": (9, "2026-07-11", "2026-11-21"),
    "personal/tide-clock": (6, "2026-08-22", "2026-10-25"),
    "personal/pixel-garden": (12, "2026-10-03", "2026-11-21"),
    "personal/dotfiles": (2, "2026-07-06", "2026-11-21"),
}
# model: first day, last day, weight, output scale
MODELS = {
    "claude-opus-4-8": ("2026-07-06", "2026-08-23", 60, 1.0),
    "claude-fable-5": ("2026-07-06", "2026-10-15", 14, 1.3),
    "claude-sonnet-4-6": ("2026-07-06", "2026-07-25", 22, 0.9),
    "claude-sonnet-5": ("2026-07-25", "2026-10-10", 22, 0.9),
    "claude-haiku-4-5-20251001": ("2026-07-06", "2026-11-16", 14, 0.4),
    "claude-opus-5": ("2026-08-24", "2026-10-14", 60, 1.0),
    "claude-opus-5-5": ("2026-10-14", "2026-11-21", 60, 1.0),
    "claude-sonnet-5-5": ("2026-10-10", "2026-11-21", 22, 0.8),
    "claude-fable-5-1": ("2026-10-15", "2026-11-09", 14, 1.3),
    "claude-fable-5-2": ("2026-11-09", "2026-11-21", 14, 1.3),
    "claude-haiku-5-5": ("2026-11-16", "2026-11-21", 14, 0.4),
}
WORK_HOURS = {8: 2, 9: 6, 10: 9, 11: 8, 12: 3, 13: 5, 14: 9, 15: 10, 16: 8, 17: 5, 18: 2}
HOME_HOURS = {9: 1, 10: 3, 11: 3, 14: 2, 15: 2, 17: 1, 19: 4, 20: 7, 21: 8, 22: 5, 23: 2}


def pick(rng, weights):
    return rng.choices(list(weights), list(weights.values()))[0]


def messages(rng):
    day, count = START, 0
    while day <= END:
        key = day.date().isoformat()
        weekend = day.weekday() >= 5
        progress = (day - START) / (END - START)
        load = (2.2 if weekend else 7) * (0.7 + 0.8 * progress) * rng.lognormvariate(0, 0.45)
        if GAP[0] <= key <= GAP[1] or rng.random() < (0.3 if weekend else 0.04):
            load = 0
        for _ in range(round(load)):
            live = {r: w * (0.04 if weekend and r.startswith("work/") else 2.5 if weekend else 1)
                    for r, (w, a, b) in REPOS.items() if a <= key <= b}
            models = {m: w for m, (a, b, w, _) in MODELS.items() if a <= key < b or key == b == END.date().isoformat()}
            repo, model = pick(rng, live), pick(rng, models)
            hours = WORK_HOURS if repo.startswith("work/") and not weekend else HOME_HOURS
            at = day + timedelta(hours=pick(rng, hours), minutes=rng.randrange(60), seconds=rng.randrange(60))
            scale, context = MODELS[model][3], rng.randint(18_000, 40_000)
            for turn in range(max(3, int(rng.lognormvariate(math.log(38), 0.7)))):
                fresh = rng.randint(2, 12) if rng.random() < 0.97 else rng.randint(500, 6000)
                write = context if turn == 0 else int(rng.lognormvariate(math.log(2100), 0.8))
                read = 0 if turn == 0 else context
                write_1h = write if rng.random() < 0.55 else 0
                output = int(rng.lognormvariate(math.log(620 * scale), 0.9))
                thinking = int(output * rng.betavariate(3, 3)) if at >= SPLIT_FROM else None
                count += 1
                yield (f"msg_{count}", at.isoformat(), f"{Path.home()}/code/{repo}", model,
                       fresh, write, read, output, write_1h, thinking)
                context += write if turn else 0
                context = rng.randint(22_000, 32_000) if context > 190_000 else context
                at += timedelta(seconds=rng.randint(8, 70))
                # Keep every session on its own day.
                if at.date() != day.date():
                    break
        day += timedelta(days=1)


def main():
    os.environ["TZ"] = "UTC"
    time.tzset()
    sys.dont_write_bytecode = True
    with tempfile.TemporaryDirectory() as home:
        os.environ["HOME"] = home
        loader = SourceFileLoader("claude_tokens", str(ROOT / "bin/claude-tokens"))
        tool = importlib.util.module_from_spec(importlib.util.spec_from_loader("claude_tokens", loader))
        loader.exec_module(tool)
        assert str(tool.LEDGER).startswith(home)
        tool.CONFIG.update(root=Path(home) / "code", gaps=[GAP])
        tool.LEDGER.parent.mkdir(parents=True)
        tool.subprocess.run = lambda *a, **k: None
        db = sqlite3.connect(tool.LEDGER)
        db.executescript(tool.SCHEMA)
        db.executemany(tool.UPSERT, messages(random.Random(7)))
        tool.write_report(db)
        db.close()
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(tool.REPORT.read_text())


if __name__ == "__main__":
    main()
