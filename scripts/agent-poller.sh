#!/bin/bash
# Agent Activity Poller for Command Center
# Runs every minute to log OpenClaw agent activity to the database
# Add to crontab: * * * * * /path/to/agent-poller.sh

SUPABASE_URL="https://yhyxxjeiogvgdsfvdkfx.supabase.co"
AUTH_TOKEN="agent-log-123"

# Get active sessions from last 5 minutes
SESSIONS=$(openclaw sessions --active 5 --json 2>/dev/null)

if [ -z "$SESSIONS" ]; then
  exit 0
fi

# Parse sessions and log each agent
echo "$SESSIONS" | jq -r '.sessions[] | @base64' 2>/dev/null | while read -r session; do
  SESSION_DATA=$(echo "$session" | base64 -d)
  
  AGENT_ID=$(echo "$SESSION_DATA" | jq -r '.agentId // "main"')
  AGE_MS=$(echo "$SESSION_DATA" | jq -r '.ageMs // 0')
  TOKENS=$(echo "$SESSION_DATA" | jq -r '.totalTokensFresh // false')
  
  # Map agent name to ID
  case "$AGENT_ID" in
    main) ID="11111111-1111-1111-1111-000000000001" ;;
    product-lead) ID="11111111-1111-1111-1111-000000000002" ;;
    head-of-design) ID="11111111-1111-1111-1111-000000000003" ;;
    product-designer-app) ID="11111111-1111-1111-1111-000000000004" ;;
    web-designer-marketing) ID="11111111-1111-1111-1111-000000000005" ;;
    tech-lead-architect) ID="11111111-1111-1111-1111-000000000006" ;;
    frontend-engineer) ID="11111111-1111-1111-1111-000000000007" ;;
    backend-engineer) ID="11111111-1111-1111-1111-000000000008" ;;
    mobile-engineer) ID="11111111-1111-1111-1111-000000000009" ;;
    seo-web-developer) ID="11111111-1111-1111-1111-000000000010" ;;
    growth-lead) ID="11111111-1111-1111-1111-000000000011" ;;
    marketing-producer) ID="11111111-1111-1111-1111-000000000012" ;;
    marketing-ops-analytics) ID="11111111-1111-1111-1111-000000000013" ;;
    qa-auditor) ID="11111111-1111-1111-1111-000000000014" ;;
    *) ID="" ;;
  esac
  
  if [ -z "$ID" ]; then
    continue
  fi
  
  # Determine status based on age
  if [ "$AGE_MS" -lt 300000 ]; then
    STATUS="active"
  else
    STATUS="idle"
  fi
  
  # Log agent status
  curl -s -X POST "http://localhost:3000/api/agent/log" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"status\",\"data\":{\"agent_id\":\"$ID\",\"status\":\"$STATUS\"}}" \
    > /dev/null 2>&1
  
  # Log usage if tokens changed
  if [ "$TOKENS" = "true" ]; then
    INPUT_TOKENS=$(echo "$SESSION_DATA" | jq -r '.inputTokens // 0')
    OUTPUT_TOKENS=$(echo "$SESSION_DATA" | jq -r '.outputTokens // 0')
    TOTAL_TOKENS=$(echo "$SESSION_DATA" | jq -r '.totalTokens // 0')
    MODEL=$(echo "$SESSION_DATA" | jq -r '.model // "minimax/minimax-m2.5"')
    PROVIDER=$(echo "$SESSION_DATA" | jq -r '.modelProvider // "openrouter"')
    
    # Estimate cost (rough approximation)
    COST=$(echo "scale=6; $TOTAL_TOKENS * 0.000001" | bc)
    
    curl -s -X POST "http://localhost:3000/api/agent/log" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"usage\",\"data\":{\"agent_id\":\"$ID\",\"model\":\"$MODEL\",\"provider\":\"$PROVIDER\",\"tokens_in\":$INPUT_TOKENS,\"tokens_out\":$OUTPUT_TOKENS,\"cost_usd\":$COST}}" \
      > /dev/null 2>&1
  fi
  
  echo "Logged $AGENT_ID: $STATUS"
done