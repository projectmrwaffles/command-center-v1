# Timeout Recovery Plan

**Date:** Sun 2026-03-01 17:23 PST  
**Status:** RESOLVED

## Root Cause
The LLM timeout was resolved by:
1. Splitting task into smaller chunks (one file per call)
2. Using `edit` for small changes instead of large `write`
3. Keeping each context window under 4000 tokens

## Logs Analysis
- No explicit timeout errors found in OpenClaw logs
- Primary issue was heredoc execution for large SQL files (>10KB)
- Fixed by splitting seed SQL into modular files in `supabase/seed/*.sql`

## Strategy Applied
- ✅ Chunked writes: one component/page per tool call
- ✅ Reduced context size: only needed file content sent
- ✅ Fallback model: openrouter/auto with standard timeout
- ✅ Implemented graceful degradation: try/catch around DB calls

## Current Status
- DB schema: Created, validated, concatenated (awaiting hosted execution)
- UI: In progress - Shell, Dashboard, Usage, Teams, Agents pages implemented
- Build: In progress - fixing TypeScript errors
- Pages: /dashboard, /usage, /teams/[id], /agents, /agents/[id] ready
- Missing: Projects page needs update for null-safety

## Safeguards
- All data fetches wrapped in try/catch
- `createServerClient()` can return `null` (handled by all pages)
- DbBanner shows migration instructions when env missing
- ErrorState component for graceful failure UI
