#!/bin/bash
#
# Install Background Export as launchd Service (macOS)
#
# This creates a LaunchAgent that runs the background export script every minute
# to automatically export active Claude Code conversations.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.claude.conversation-exporter"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_NAME}.plist"
EXPORT_SCRIPT="${SCRIPT_DIR}/background-export.sh"

echo "🔧 Installing Claude Conversation Background Exporter..."
echo

# Ensure LaunchAgents directory exists
mkdir -p "${HOME}/Library/LaunchAgents"

# Ensure export script is executable
chmod +x "$EXPORT_SCRIPT"

# Create launchd plist
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${EXPORT_SCRIPT}</string>
    </array>

    <key>StartInterval</key>
    <integer>60</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${HOME}/.claude/claude_conversations/logs/background-export-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${HOME}/.claude/claude_conversations/logs/background-export-stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
    </dict>

    <key>Nice</key>
    <integer>10</integer>

    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
EOF

echo "✅ Created launchd plist at: $PLIST_PATH"
echo

# Load the service
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "🔄 Unloading existing service..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

echo "🚀 Loading service..."
launchctl load "$PLIST_PATH"

echo
echo "✅ Background export service installed successfully!"
echo
echo "📊 Service Details:"
echo "   • Runs every: 60 seconds"
echo "   • Export script: $EXPORT_SCRIPT"
echo "   • Logs:"
echo "     - Timing: ~/.claude/claude_conversations/logs/background-export-timing.log"
echo "     - Stats: ~/.claude/claude_conversations/logs/background-export-stats.log"
echo "     - Stdout: ~/.claude/claude_conversations/logs/background-export-stdout.log"
echo "     - Stderr: ~/.claude/claude_conversations/logs/background-export-stderr.log"
echo
echo "🔍 Management Commands:"
echo "   • Check status: launchctl list | grep claude"
echo "   • View logs: tail -f ~/.claude/claude_conversations/logs/background-export-stats.log"
echo "   • Uninstall: ${SCRIPT_DIR}/uninstall-background-export.sh"
echo

# Verify it loaded
sleep 2
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "✅ Service is running"
else
    echo "⚠️  Service may not have started - check: launchctl list | grep claude"
fi
