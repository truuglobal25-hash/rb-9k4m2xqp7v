#!/bin/bash
# Takes the route book off the internet, one month after it went up.
#
# The GitHub token here has 'repo' but not 'delete_repo', so it cannot remove the
# repository itself. It can do the thing that actually matters: switch Pages off
# and wipe every file. The address stops answering and the encrypted book stops
# existing on the server.
#
# The app already on the phone is untouched — it keeps its own cached copy and
# goes on working with no signal. What is lost is the update path.

set -u
REPO="truuglobal25-hash/rb-9k4m2xqp7v"
DIR="$HOME/routebook-pwa"
LOG="$DIR/takedown.log"
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

say() { echo "$(date '+%Y-%m-%d %H:%M')  $*" >> "$LOG"; }

say "takedown starting for $REPO"

# 1. stop the site serving
if gh api -X DELETE "repos/$REPO/pages" >/dev/null 2>&1; then
  say "Pages disabled"
else
  say "Pages disable failed or already off"
fi

# 2. remove every file, so nothing is left to fetch
cd "$DIR" 2>/dev/null || { say "cannot reach $DIR - stopping"; exit 1; }
rm -f index.html sw.js manifest.json icon.svg robots.txt 2>/dev/null
printf 'Taken down.\n' > README.md
git add -A >/dev/null 2>&1
git -c user.email=truuglobal25@gmail.com -c user.name="Yusuf Overseas" \
    commit -qm "take down: remove published book" >/dev/null 2>&1
if git push -q origin main >/dev/null 2>&1; then
  say "files removed and pushed"
else
  say "push failed - files may still be on GitHub, check by hand"
fi

# 3. confirm the address is actually dead
CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "https://truuglobal25-hash.github.io/rb-9k4m2xqp7v/" || echo "000")
say "address now returns $CODE (404 or 000 means it is down)"

# 4. do not run again
launchctl unload "$HOME/Library/LaunchAgents/com.yusufoverseas.routebook-takedown.plist" 2>/dev/null
say "takedown finished"
