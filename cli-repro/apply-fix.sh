#!/usr/bin/env bash
# Applies the two halves of the fix to the scratch project:
#   1. the vocabulary block  -> scratch/site/CLAUDE.md
#   2. no shell at all       -> scratch/site/.claude/settings.json
#
# Point 2 is the argument in miniature. We are not denying "git commit" by name,
# because a rule that matches command text can be sidestepped by a differently
# shaped invocation of the same program. We remove the capability instead.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$HERE/scratch/site"

if [ ! -d "$SITE" ]; then
  echo "No scratch project. Run:  bash setup.sh"
  exit 1
fi

mkdir -p "$SITE/.claude"
cp "$HERE/after/CLAUDE.md" "$SITE/CLAUDE.md"
cp "$HERE/after/settings.json" "$SITE/.claude/settings.json"

echo "Applied:"
echo "  $SITE/CLAUDE.md                 vocabulary block"
echo "  $SITE/.claude/settings.json     shell removed"
echo
echo "Next:  cd scratch/site  &&  claude"
echo "Then:  make the logo bigger"
echo "       commit that"
echo "       what branch am I on"
echo
echo "To go back to the BEFORE state:"
echo "  rm \"$SITE/CLAUDE.md\" \"$SITE/.claude/settings.json\""
