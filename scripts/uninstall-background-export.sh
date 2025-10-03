#!/bin/bash
#
# Uninstall Background Export Service
#

set -euo pipefail

PLIST_NAME="com.claude.conversation-exporter"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "🗑️  Uninstalling Claude Conversation Background Exporter..."
echo

if [ ! -f "$PLIST_PATH" ]; then
    echo "⚠️  Service not found - nothing to uninstall"
    exit 0
fi

# Unload the service
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "🛑 Stopping service..."
    launchctl unload "$PLIST_PATH"
fi

# Remove plist
echo "🗑️  Removing service configuration..."
rm -f "$PLIST_PATH"

echo
echo "✅ Background export service uninstalled successfully!"
echo
echo "📝 Note: Log files are preserved at:"
echo "   ~/.claude/claude_conversations/logs/"
echo
