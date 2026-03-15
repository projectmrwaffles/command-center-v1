#!/bin/bash
COMMAND_CENTER_URL="${COMMAND_CENTER_URL:-http://localhost:3000}"
AUTH_TOKEN="${AGENT_AUTH_TOKEN:-}"

if [ -z "$AUTH_TOKEN" ]; then
  echo "AGENT_AUTH_TOKEN is required" >&2
  exit 1
fi

action="$1"
case "$action" in
  status|usage|event|task-update)
    ;;
  *)
    echo "Usage: $0 <status|usage|event|task-update> ..." >&2
    exit 1
    ;;
esac

echo "Use the authenticated /api/agent/log endpoint with AGENT_AUTH_TOKEN. This helper no longer ships insecure defaults." >&2
exit 1
