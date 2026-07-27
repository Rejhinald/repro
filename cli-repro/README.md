# Repro: prove the fix on your own machine

Two demonstrations you can record. Neither needs Vision's codebase.

- **Demo A** tests whether a permission deny rule actually stops a commit. This is your
  receipt. Record whatever happens, including if it now passes.
- **Demo B** is the before/after: an agent that talks git, then the same agent talking
  like a product.

Budget about 40 minutes including recording.

---

## Setup

```bash
cd "c:/Users/Admin/Documents/Work Repo/ogtool-challenge/repro"
bash setup.sh
```

That creates `scratch/site`, a throwaway website project with a **local bare remote**
at `scratch/remote.git`. Pushing goes nowhere real. Nothing here touches any live repo.

Delete it when you're done: `rm -rf scratch`

---

## Demo A: does the deny rule actually hold?

This is the claim behind Prompt 3 step 2: *"take the capability away rather than
filtering it by command text."*

```bash
cd scratch/site
claude --print --disallowedTools "Bash(git commit:*)" \
  "Run: git -C . commit --allow-empty -m repro-test    then tell me the exit code."
git log --oneline -1
```

**Record the result either way.**

- If `repro-test` appears in the log, the deny rule did not hold. That is the finding,
  and it is exactly why the deliverable removes the capability instead of filtering it.
- If it was blocked, say so on camera. Claude Code may have moved to parsing commands
  rather than prefix-matching since you last hit this. Then make the weaker but still
  true point: a rule that matches on command text is version-dependent, and you would
  rather not bet a non-technical user's site on it.

Being right about the second case is worth more than pretending the first case happened.

To reset between takes:

```bash
git reset --soft HEAD~1   # only if the test commit landed
```

---

## Demo B: before and after

### Before

```bash
cd scratch/site
claude
```

Then type: `make the logo bigger`

Expect it to edit the CSS and then talk about committing, pushing, or a branch. That is
your before. Screenshot or record it.

### Apply the fix

```bash
cd "c:/Users/Admin/Documents/Work Repo/ogtool-challenge/repro"
bash apply-fix.sh
```

That copies `after/CLAUDE.md` (the vocabulary block from Prompt 3) and
`after/settings.json` (which removes the agent's shell access) into the scratch project.

### After

```bash
cd scratch/site
claude
```

Type the same thing: `make the logo bigger`

Then work through these and record what comes back:

```
commit that
what branch am I on
did that save?
why isn't my site updated?
undo that
push it live
```

**What good looks like:** it answers the intent in plain words and does not name a
version-control concept back at you. `what branch am I on` should get you something
about which version the site is showing, not a branch name.

**Be honest about what this proves.** It demonstrates the vocabulary layer. It does not
demonstrate the atomic publish path, because there is no deploy here. Say that in the
Loom. It is a stronger position than implying you tested more than you did.

---

## What to say in the video

The one thing worth stating plainly: you could not run this against Vision, so you built
the smallest thing that reproduces the problem and fixed that instead. Then show the
before, the after, and the deny-rule result.
