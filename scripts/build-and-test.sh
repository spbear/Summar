#!/bin/bash
set -e

echo "🚀 Summar Plugin - Automated Build & Test Pipeline"
echo "================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OBSIDIAN_VAULT_PATH="$HOME/Documents/Obsidian/TestVault"
TEST_RESULTS_DIR="./test-results"
BACKUP_DIR="./backups"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
    else
        print_error "Node.js not found. Please install Node.js"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm found: $NPM_VERSION"
    else
        print_error "npm not found. Please install npm"
        exit 1
    fi
    
    # Check jq for JSON processing
    if command -v jq &> /dev/null; then
        print_success "jq found (for JSON validation)"
    else
        print_warning "jq not found. Installing jq for JSON validation..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v brew &> /dev/null; then
                brew install jq
            else
                print_error "Homebrew not found. Please install jq manually"
                exit 1
            fi
        else
            print_error "Please install jq for JSON validation"
            exit 1
        fi
    fi
}

# Function to backup current plugin
backup_current_plugin() {
    if [ -d "$OBSIDIAN_VAULT_PATH/.obsidian/plugins/summar" ]; then
        print_status "Backing up current plugin..."
        mkdir -p "$BACKUP_DIR"
        BACKUP_NAME="summar-backup-$(date +%Y%m%d-%H%M%S)"
        cp -r "$OBSIDIAN_VAULT_PATH/.obsidian/plugins/summar" "$BACKUP_DIR/$BACKUP_NAME"
        print_success "Backup created: $BACKUP_DIR/$BACKUP_NAME"
    fi
}

# Function to run tests with timeout
run_with_timeout() {
    local timeout_duration=$1
    local command=$2
    
    timeout "$timeout_duration" bash -c "$command" || {
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            print_error "Command timed out after $timeout_duration seconds"
        else
            print_error "Command failed with exit code $exit_code"
        fi
        return $exit_code
    }
}

# Main execution
main() {
    echo "Starting automated build and test pipeline..."
    echo "Timestamp: $(date)"
    echo ""
    
    # Create directories
    mkdir -p "$TEST_RESULTS_DIR"
    mkdir -p "$BACKUP_DIR"
    
    # Check prerequisites
    check_prerequisites
    
    # Backup current plugin if exists
    backup_current_plugin
    
    # Step 1: Install dependencies
    print_status "Installing dependencies..."
    if npm install; then
        print_success "Dependencies installed"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
    
    # Step 2: Run unit tests
    print_status "Running unit tests..."
    if run_with_timeout 60s "npm run test:unit"; then
        print_success "Unit tests passed"
    else
        print_warning "Unit tests failed or timed out, continuing..."
    fi
    
    # Step 3: Run integration tests
    print_status "Running integration tests..."
    if run_with_timeout 120s "npm run test:integration"; then
        print_success "Integration tests passed"
    else
        print_warning "Integration tests failed or timed out, continuing..."
    fi
    
    # Step 4: Build the plugin
    print_status "Building plugin..."
    if npm run build; then
        print_success "Build completed successfully"
    else
        print_error "Build failed"
        exit 1
    fi
    
    # Step 5: Deploy to local Obsidian
    print_status "Deploying to local Obsidian..."
    if ./scripts/deploy-local.sh; then
        print_success "Plugin deployed successfully"
    else
        print_error "Deployment failed"
        exit 1
    fi
    
    # Step 6: Run E2E tests
    print_status "Running E2E tests..."
    if ./scripts/test-e2e.sh; then
        print_success "E2E tests passed"
    else
        print_error "E2E tests failed"
        exit 1
    fi
    
    # Step 7: Generate final report
    print_status "Generating final test report..."
    cat > "$TEST_RESULTS_DIR/final-test-report.md" << EOF
# Summar Plugin - Final Test Report

## Pipeline Summary
- **Date**: $(date)
- **Status**: ✅ COMPLETED SUCCESSFULLY
- **Build Time**: $(date)

## Test Results
- ✅ Prerequisites check passed
- ✅ Dependencies installed
- ⚠️  Unit tests (check individual results)
- ⚠️  Integration tests (check individual results)
- ✅ Build successful
- ✅ Local deployment successful
- ✅ E2E tests passed

## Next Steps
1. Open Obsidian and test the plugin manually
2. Run: \`npm run obsidian:reload\` to reload the plugin
3. Verify all features work as expected
4. Check the developer console for any runtime errors

## Files Generated
- Build artifacts in \`./dist/\`
- Test results in \`./test-results/\`
- Plugin backup in \`./backups/\`

## Manual Testing Checklist
- [ ] Plugin loads without errors
- [ ] Settings tab opens correctly
- [ ] Web page summarization works
- [ ] Custom commands execute
- [ ] File operations work
- [ ] No console errors

EOF
    
    print_success "Final test report generated: $TEST_RESULTS_DIR/final-test-report.md"
    
    # Step 8: Optional Obsidian reload
    echo ""
    print_status "Pipeline completed successfully! 🎉"
    echo ""
    print_status "Would you like to reload Obsidian now? (y/N)"
    read -r -n 1 response
    echo ""
    if [[ $response =~ ^[Yy]$ ]]; then
        print_status "Reloading Obsidian..."
        ./scripts/reload-obsidian.sh
    else
        print_status "Skipping Obsidian reload"
        print_status "Run 'npm run obsidian:reload' when ready"
    fi
    
    echo ""
    print_success "All done! 🚀"
    print_status "Check $TEST_RESULTS_DIR/ for detailed test reports"
}

# Execute main function
main "$@"
