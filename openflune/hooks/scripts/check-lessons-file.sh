#!/bin/sh
# Verify openflune is configured. The presence of .claude/config.json — created by
# /openflune:configure — is the canonical signal. Reference docs live under docs/
# (on-demand) and are not required for this check.
test -f .claude/config.json || echo 'WARNING: .claude/config.json not found. Run /openflune:configure to set up.'
