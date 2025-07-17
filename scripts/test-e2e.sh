#!/bin/bash
set -e

echo "🧪 Running End-to-End Tests for Summar Plugin..."

# Configuration
OBSIDIAN_VAULT_PATH="$HOME/Documents/Obsidian/TestVault"
PLUGIN_DIR="$OBSIDIAN_VAULT_PATH/.obsidian/plugins/summar"
TEST_RESULTS_DIR="./test-results"

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"

# Check if plugin is deployed
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "❌ Plugin not found in Obsidian vault"
    echo "🚀 Running local deployment first..."
    ./scripts/deploy-local.sh
fi

echo "🔍 Verifying plugin files..."

# Check required files
required_files=("main.js" "manifest.json" "styles.css")
for file in "${required_files[@]}"; do
    if [ -f "$PLUGIN_DIR/$file" ]; then
        echo "✅ $file found"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Test manifest.json validity
echo "📋 Testing manifest.json validity..."
if jq empty "$PLUGIN_DIR/manifest.json" 2>/dev/null; then
    echo "✅ manifest.json is valid JSON"
    
    # Extract and display plugin info
    PLUGIN_ID=$(jq -r '.id' "$PLUGIN_DIR/manifest.json")
    PLUGIN_NAME=$(jq -r '.name' "$PLUGIN_DIR/manifest.json")
    PLUGIN_VERSION=$(jq -r '.version' "$PLUGIN_DIR/manifest.json")
    
    echo "📦 Plugin ID: $PLUGIN_ID"
    echo "📦 Plugin Name: $PLUGIN_NAME"
    echo "📦 Plugin Version: $PLUGIN_VERSION"
else
    echo "❌ manifest.json is invalid JSON"
    exit 1
fi

# Test additional JSON files
echo "🔍 Testing additional JSON files..."
json_files=("models.json" "prompts.json" "model-pricing.json")
for file in "${json_files[@]}"; do
    if [ -f "$PLUGIN_DIR/$file" ]; then
        if jq empty "$PLUGIN_DIR/$file" 2>/dev/null; then
            echo "✅ $file is valid JSON"
        else
            echo "❌ $file is invalid JSON"
            exit 1
        fi
    else
        echo "⚠️  $file not found (optional)"
    fi
done

# Check file sizes (basic smoke test)
echo "📏 Checking file sizes..."
main_js_size=$(stat -f%z "$PLUGIN_DIR/main.js" 2>/dev/null || stat -c%s "$PLUGIN_DIR/main.js" 2>/dev/null)
if [ "$main_js_size" -gt 1000 ]; then
    echo "✅ main.js size: ${main_js_size} bytes (seems reasonable)"
else
    echo "❌ main.js size: ${main_js_size} bytes (too small, possible build issue)"
    exit 1
fi

# Test CSS file
if [ -f "$PLUGIN_DIR/styles.css" ]; then
    css_size=$(stat -f%z "$PLUGIN_DIR/styles.css" 2>/dev/null || stat -c%s "$PLUGIN_DIR/styles.css" 2>/dev/null)
    echo "✅ styles.css size: ${css_size} bytes"
fi

# Generate test report
echo "📊 Generating test report..."
cat > "$TEST_RESULTS_DIR/e2e-test-report.md" << EOF
# Summar Plugin E2E Test Report

## Test Summary
- **Date**: $(date)
- **Plugin ID**: $PLUGIN_ID
- **Plugin Name**: $PLUGIN_NAME
- **Plugin Version**: $PLUGIN_VERSION
- **Test Status**: ✅ PASSED

## File Verification
- ✅ main.js (${main_js_size} bytes)
- ✅ manifest.json (valid JSON)
- ✅ styles.css (${css_size} bytes)

## JSON Validation
EOF

for file in "${json_files[@]}"; do
    if [ -f "$PLUGIN_DIR/$file" ]; then
        echo "- ✅ $file (valid JSON)" >> "$TEST_RESULTS_DIR/e2e-test-report.md"
    else
        echo "- ⚠️  $file (not found)" >> "$TEST_RESULTS_DIR/e2e-test-report.md"
    fi
done

cat >> "$TEST_RESULTS_DIR/e2e-test-report.md" << EOF

## Manual Testing Checklist
Please verify the following in Obsidian:

### Plugin Loading
- [ ] Plugin appears in Community Plugins list
- [ ] Plugin can be enabled without errors
- [ ] No console errors on plugin load

### Core Features
- [ ] SummarView opens correctly
- [ ] Settings tab loads without errors
- [ ] Command palette shows Summar commands
- [ ] Context menus include Summar options

### API Integration
- [ ] OpenAI API key can be set
- [ ] Gemini API key can be set
- [ ] Web page summarization works
- [ ] Custom commands execute properly

### File Operations
- [ ] Plugin can create new notes
- [ ] Plugin can read existing notes
- [ ] Audio file processing works (if applicable)

## Notes
- Run this test after each build
- Manual verification required for full functionality
- Check browser/developer console for any runtime errors
EOF

echo ""
echo "✅ E2E tests completed successfully!"
echo "📊 Test report saved to: $TEST_RESULTS_DIR/e2e-test-report.md"
echo ""
echo "🔄 Ready to reload Obsidian? Run: npm run obsidian:reload"
echo ""
echo "📋 Manual testing steps:"
echo "1. Open Obsidian"
echo "2. Go to Settings > Community Plugins"
echo "3. Enable the Summar plugin"
echo "4. Test core functionality"
echo "5. Check developer console for errors"
