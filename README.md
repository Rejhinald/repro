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

No install, no backend, no build step.

```bash
node static-serve.mjs      # or any static server
```

Open http://localhost:4100 and paste a Gemini API key when asked. The key is kept in
your browser's local storage and is never committed to this repository.

Try, in order:

```
make the logo bigger
commit that
what branch am I on
push to prod
```

Watch the status chip, the Preview and Live tabs, and the version list.

Flip **Plain language** off in the top right to see the before. It changes exactly one
thing, the system instruction in [vision-web/prompts.js](vision-web/prompts.js), so the
two modes are directly comparable.

### Why preview and live cannot drift

Publishing copies the working files to the published files, and both panes are rendered
by the same function, so the only way they can differ is if the files differ. The app
re-reads the published copy afterwards and refuses to report success if it does not
match. **The app decides what is live and says so; the model never does**, because the
model cannot know. That is the same principle as taking git away from it.

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
