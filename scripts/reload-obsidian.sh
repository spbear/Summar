#!/bin/bash
set -e

echo "🔄 Reloading Obsidian..."

# Method 1: Using AppleScript (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Using AppleScript to reload Obsidian (macOS)"
    
    # Check if Obsidian is running
    if pgrep -f "Obsidian" > /dev/null; then
        echo "📱 Obsidian is running, sending reload command..."
        
        osascript << EOF
tell application "System Events"
    tell process "Obsidian"
        # Try to use Cmd+R to reload
        key code 15 using command down
    end tell
end tell
EOF
        
        echo "✅ Reload command sent to Obsidian"
    else
        echo "❌ Obsidian is not running"
        echo "💡 Please start Obsidian manually"
    fi
else
    echo "🐧 Non-macOS system detected"
    echo "💡 Please reload Obsidian manually:"
    echo "   - Ctrl+R (Windows/Linux)"
    echo "   - Or disable/enable the plugin in settings"
fi

echo ""
echo "📋 Manual reload alternatives:"
echo "1. Ctrl/Cmd+R in Obsidian"
echo "2. Settings > Community Plugins > Summar > Disable/Enable"
echo "3. Developer Console: app.plugins.disablePlugin('summar-ai-powered-summarizer'); app.plugins.enablePlugin('summar-ai-powered-summarizer')"
