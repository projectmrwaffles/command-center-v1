#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.command-center.attachment-worker.plist"
LOG_DIR="$REPO_ROOT/.ops-logs"
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.command-center.attachment-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>run</string>
    <string>worker:attachment</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/attachment-worker.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/attachment-worker.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"
launchctl kickstart -k gui/$(id -u)/com.command-center.attachment-worker

echo "Installed launchd worker: $PLIST_PATH"
echo "Log file: $LOG_DIR/attachment-worker.log"
