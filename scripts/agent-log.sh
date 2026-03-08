#!/bin/bash
# Agent Activity Logger for Command Center
# Usage: ./agent-log.sh <action> [params]
#
# Actions:
#   status <agent_id> <active|idle|offline> [job_id]
#   usage <agent_id> <model> <provider> <tokens_in> <tokens_out> <cost_usd> [project_id] [job_id]
#   event <agent_id> <event_type> [project_id] [job_id] [description]
#   task-update <task_id> <status> [description]

COMMAND_CENTER_URL="${COMMAND_CENTER_URL:-http://localhost:3000}"
AUTH_TOKEN="${AGENT_AUTH_TOKEN:-agent-log-123}"

ACTION="$1"

case "$ACTION" in
  status)
    AGENT_ID="$2"
    STATUS="$3"
    JOB_ID="${4:-}"
    
    curl -s -X POST "$COMMAND_CENTER_URL/api/agent/log" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"status\",\"data\":{\"agent_id\":\"$AGENT_ID\",\"status\":\"$STATUS\",\"job_id\":\"$JOB_ID\"}}"
    ;;
    
  usage)
    AGENT_ID="$2"
    MODEL="$3"
    PROVIDER="$4"
    TOKENS_IN="$5"
    TOKENS_OUT="$6"
    COST="$7"
    PROJECT_ID="${8:-}"
    JOB_ID="${9:-}"
    
    curl -s -X POST "$COMMAND_CENTER_URL/api/agent/log" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"usage\",\"data\":{\"agent_id\":\"$AGENT_ID\",\"model\":\"$MODEL\",\"provider\":\"$PROVIDER\",\"tokens_in\":$TOKENS_IN,\"tokens_out\":$TOKENS_OUT,\"cost_usd\":$COST,\"project_id\":\"$PROJECT_ID\",\"job_id\":\"$JOB_ID\"}}"
    ;;
    
  event)
    AGENT_ID="$2"
    EVENT_TYPE="$3"
    PROJECT_ID="${4:-}"
    JOB_ID="${5:-}"
    DESCRIPTION="${6:-}"
    
    curl -s -X POST "$COMMAND_CENTER_URL/api/agent/log" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"event\",\"data\":{\"agent_id\":\"$AGENT_ID\",\"event_type\":\"$EVENT_TYPE\",\"project_id\":\"$PROJECT_ID\",\"job_id\":\"$JOB_ID\",\"payload\":{\"description\":\"$DESCRIPTION\"}}}"
    ;;
    
  task-update)
    TASK_ID="$2"
    STATUS="$3"
    DESCRIPTION="${4:-}"
    
    curl -s -X POST "$COMMAND_CENTER_URL/api/agent/log" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"task_update\",\"data\":{\"task_id\":\"$TASK_ID\",\"status\":\"$STATUS\",\"description\":\"$DESCRIPTION\"}}"
    ;;
    
  *)
    echo "Usage: $0 <action> [params]"
    echo ""
    echo "Actions:"
    echo "  $0 status <agent_id> <active|idle|offline> [job_id]"
    echo "  $0 usage <agent_id> <model> <provider> <tokens_in> <tokens_out> <cost_usd> [project_id] [job_id]"
    echo "  $0 event <agent_id> <event_type> [project_id] [job_id] [description]"
    echo "  $0 task-update <task_id> <todo|in_progress|blocked|done> [description]"
    ;;
esac