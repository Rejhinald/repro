# Vision: stop the agent speaking git to non-technical users

Answer to the product engineer challenge.

| | |
|---|---|
| [DELIVERABLE.md](DELIVERABLE.md) | The answer: diagnosis, the three prompts, expected flow, test plan |
| [vision-web/](vision-web/) | **Run this.** A minimal Vision, frontend only. Prompt a site, preview it, publish it live |
| [cli-repro/](cli-repro/) | The before/after measured on a real coding agent, plus the detector |
| [vision-mini/](vision-mini/) | The same demo wired to Claude Code instead of Gemini. Optional |

## The short version

The agent saves changes but never runs the publish step, so it tells people their site
is updated when it isn't. The git vocabulary is the symptom. The wrong-thing-happened is
the bug.

A system prompt cannot fix the first half. A tool's name is serialized into every model
request and every tool result, so in a long session the banned word sits in context
hundreds of times as high-probability text while the prohibition is there once. That
ratio is not something better wording wins. You change what the agent can do, not what
it is told to say.

## Run the demo

No install, no backend, no build step. Publishing is real: it commits to `master` and
GitHub Pages serves it at **https://rejhinald.github.io/repro/**

```bash
node static-serve.mjs      # or any static server
```

Open http://localhost:4100. It asks for two things, both kept in your browser's local
storage and neither committed to this repository:

- a **Gemini API key**
- a **GitHub token** with `repo` scope, so changes can actually go live

Try, in order:

```
make the logo bigger
commit that
what branch am I on
push to prod
```

Watch the status chip, the Preview and Live tabs, and the version list. The Live tab
loads the real public site, not a local copy of it.

Flip **Plain language** off in the top right to see the before. It changes exactly one
thing, the system instruction in [vision-web/prompts.js](vision-web/prompts.js), so the
two modes are directly comparable.

### Publishing is one commit, and "live" is never a guess

Multiple changed files go up as a **single commit** through the Git Data API. The
Contents API writes one file per commit, which means a two-file change could half-apply,
and half-applied is the bug this whole exercise is about.

Then it waits for GitHub to report that **our** commit is the one that built. `github.io`
sends no CORS headers so the browser cannot fetch the page to check it, but the Pages
build API can be asked, and a build that reports success for a different commit is not
our change. If it cannot confirm within the timeout it says "Published, it can take a
minute to show up" rather than claiming success.

**The app decides what is live and says so; the model never does**, because the model
cannot know. That is the same principle as taking git away from it.

Verify the chain yourself:

```bash
GH_TOKEN=$(gh auth token) node test-publish.mjs
```

A run on 2026-07-28 gave: commit `1bb089cb`, confirmed live after 59s, public fetch 200,
and the served bytes identical to what was published.

## What was measured

Same prompt, same repo, same permission mode, with and without the fix:

```
cli-repro/evidence/before.txt   hard-ban hits: 16   {commit:4, repo:1, diff:1, checkout:1, git:6, origin:1, remote:2}
cli-repro/evidence/after.txt    hard-ban hits: 0
```

Before, the agent offered `git checkout -b logo-size`, `git add style.css`,
`git commit -m ...` and asked whether to commit straight to `main`. After, it said the
change was not live yet and offered to update the project.

```bash
cd cli-repro && node detect.mjs --self-test && node detect.mjs evidence/*.txt
```

The detector has a self-test, because a detector that mutes the product also scores
zero. It proves it does not trip on "push the button", "merge the two columns", "pull to
refresh" or "Connect GitHub", and does catch "git commit", "push to origin" and "open a
pull request".

## Honest limits

- `vision-web` publishes to browser storage, not to a host. It demonstrates the
  vocabulary layer and the preview/live guarantee. It says nothing about a real deploy
  pipeline, which is why the written answer spends its length on how you confirm a
  change is genuinely live before telling someone it is.
- One project, one user. Two people editing at once is treated as a first-class case in
  the written answer and is not implemented here.
- Chat history is in-memory, so a reload clears the transcript.
