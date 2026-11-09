#!/usr/bin/env python3
"""Lint a composed prompt. Usage: lint-prompt.py <file|-> | --selftest. Exit 1 on any finding."""
import re
import sys

NO_OPS = ("be thorough", "think carefully", "write clean code", "think step by step", "take a deep breath")
VAGUE_DONE = ("ensure quality", "ensure it works", "ensure code works", "make sure it works", "looks good")
GOAL = re.compile(r"<task>|^#+\s*(objective|goal)|goal statement|^step 1\b", re.I | re.M)
VERIFY = re.compile(r"<verification>|^#+\s*(verification|definition of done)|done when", re.I | re.M)
CHECK = re.compile(r"`[^`]+`|\b(exits?|returns?|reports?|fails?|passes)\b", re.I)


def lint(text):
    low = text.lower()
    found = [f"no-op: {p}" for p in NO_OPS if p in low]
    found += [f"vague done criterion: {p}" for p in VAGUE_DONE if p in low]
    if chr(0x2014) in text:
        found.append("em dash (U+2014)")
    if not GOAL.search(text):
        found.append("no goal section")
    v = VERIFY.search(text)
    if not v:
        found.append("no verification section")
    elif not CHECK.search(text[v.end():]):
        found.append("verification names no command or observable state")
    return found


def selftest():
    good = "<task>Add retry</task>\n<verification>`npm test` exits 0</verification>"
    assert lint(good) == [], lint(good)
    bad = "Be thorough " + chr(0x2014) + " ensure quality."
    assert len(lint(bad)) == 5, lint(bad)  # no-op, vague, em dash, no goal, no verification
    print("selftest ok")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "-"
    if arg == "--selftest":
        selftest()
        sys.exit(0)
    raw = sys.stdin.buffer.read() if arg == "-" else open(arg, "rb").read()
    findings = lint(raw.decode("utf-8"))
    print("\n".join(findings) or "ok")
    sys.exit(1 if findings else 0)
