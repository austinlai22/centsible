#!/bin/sh
# Render's "Docker Command" field passed a raw `a && exec b` string to sh as a
# single un-split argument instead of via `sh -c` — sh then tried to run a
# program literally named "node db/migrate.js && exec node index.js" and
# failed with exit 127. A script file sidesteps the field's quoting/parsing
# behaviour entirely: the Docker Command becomes a plain two-token
# `sh scripts/start-prod.sh`, nothing left to mis-split.
#
# set -e: if the migration fails, stop here — don't boot a server against a
# schema that didn't finish applying.
set -e

node db/migrate.js

# exec replaces this shell process with node, so it becomes what dumb-init
# (PID 1, see Dockerfile) is actually supervising. Without exec, this script
# stays PID 1's direct child and Render's SIGTERM on redeploy/scale-down stops
# at the shell instead of reaching node — the graceful shutdown handler in
# index.js never runs.
exec node index.js
