# vision-mini

The smallest thing that reproduces the problem in the challenge video: a website you
change by prompting, a preview of your changes, and a live site that visitors see.

Two directories are the whole idea.

```
workspace/   what you are editing. The preview serves this.
live/        what visitors see. Publishing copies workspace -> live.
```

Publishing is a directory copy, so **live is byte-identical to the preview you
approved**. There is nothing between the two to drift. That is deliberate: the bug in
the video is that saving and publishing were different things, and a user could be told
one had happened when the other had not.

The agent is Claude Code running headless with `cwd=workspace`, which is the same shape
as "cloud code running in a box on your repo".

## Run it

```bash
bash setup.sh
node server.mjs
```

Then open http://localhost:4000

`setup.sh` makes `workspace/` a git repo with a **local bare remote** on disk. Nothing
here can reach a real repository. The repo exists so the "before" mode has something
real to talk about committing to.

## The switch

Top right there is a **Plain language** toggle. It is the entire fix, and it changes one
thing only: whether the agent gets `agent/CLAUDE.md`, the vocabulary block.

- **Off** is the before. Ask it to "make the logo bigger, then save my work" and it will
  offer you `git checkout -b`, `git add`, `git commit`, and ask whether you would rather
  commit straight to `main`.
- **On** is the after. Same request, and it tells you what changed, that it is not live
  yet, and offers to update the project.

Nothing else differs between the two modes. That is the point: the vocabulary problem is
solved at the instruction layer, and the *publishing* problem is solved by the two
directories, not by wording.

## What to try

```
make the logo bigger
change the headline to something warmer
commit that
what branch am I on
undo that
```

`commit that` and `what branch am I on` are the interesting ones. With plain language on
it should answer what you meant and never repeat the developer word back at you.

## What this does and does not prove

It proves the vocabulary layer, and it proves preview and live cannot drift apart,
because publishing is a copy and the server re-reads live afterwards to confirm.

It does not prove anything about a real deploy pipeline. There isn't one here. On a real
host you cannot assume a copy succeeded, which is why the written answer spends its time
on how you confirm a change is actually live before telling someone it is.

## Known rough edges

Kept deliberately, because this is a demo and not a product:

- Chat history is client-side only, so a page reload clears the transcript.
- One project, one user. Nothing here handles two people editing at once, which is
  exactly the case the written answer treats as a first-class conflict.
- The agent occasionally says "publish" where the button says "update project". The
  vocabulary block could name the button explicitly to pull that into line.
