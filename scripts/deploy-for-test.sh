#!/bin/bash

# Summar 플러그인을 모든 Obsidian vault에 배포하는 스크립트
# Usage: ./scripts/deploy-to-vaults.sh

set -e  # 에러 발생 시 스크립트 종료

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 현재 스크립트의 디렉토리 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ZIP 파일 경로
ZIP_FILE="$PROJECT_DIR/dist/summar.zip"

# 배포할 vault 목록
VAULTS=(
    "/Users/mcgabby/Obsidian/Learn&Play/.obsidian/plugins/summar"
    "/Users/mcgabby/Obsidian/JobInterview/.obsidian/plugins/summar"
    "/Users/mcgabby/Obsidian/JAS/.obsidian/plugins/summar"
    "/Users/mcgabby/Obsidian/Meeting/.obsidian/plugins/summar"
    "/Users/mcgabby/Obsidian/Work/.obsidian/plugins/summar"
)

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}    Summar Plugin Deployment Script${NC}"
echo -e "${BLUE}===========================================${NC}"
echo

# ZIP 파일 존재 확인
if [ ! -f "$ZIP_FILE" ]; then
    echo -e "${RED}❌ Error: ZIP file not found at $ZIP_FILE${NC}"
    echo -e "${YELLOW}💡 Please run 'npm run build' first to create the ZIP file.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found ZIP file: $ZIP_FILE${NC}"

# ZIP 파일 정보 표시
ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo -e "${BLUE}📦 ZIP file size: $ZIP_SIZE${NC}"
echo

# 각 vault에 배포
DEPLOYED_COUNT=0
FAILED_COUNT=0

for vault_path in "${VAULTS[@]}"; do
    echo -e "${YELLOW}📂 Processing: $vault_path${NC}"
    
    # 디렉토리가 존재하는지 확인
    if [ ! -d "$vault_path" ]; then
        echo -e "${RED}   ❌ Directory not found: $vault_path${NC}"
        echo -e "${YELLOW}   💡 Creating directory...${NC}"
        mkdir -p "$vault_path"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}   ✅ Directory created successfully${NC}"
        else
            echo -e "${RED}   ❌ Failed to create directory${NC}"
            ((FAILED_COUNT++))
            continue
        fi
    fi
    
    # 기존 파일들 백업 (data.json만)
    if [ -f "$vault_path/data.json" ]; then
        echo -e "${BLUE}   💾 Backing up existing data.json...${NC}"
        cp "$vault_path/data.json" "$vault_path/data.json.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # ZIP 파일 압축 해제
    echo -e "${BLUE}   📦 Extracting ZIP file...${NC}"
    if unzip -o "$ZIP_FILE" -d "$vault_path" > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Successfully deployed to $vault_path${NC}"
        ((DEPLOYED_COUNT++))
        
        # 압축 해제된 파일 목록 표시
        echo -e "${BLUE}   📄 Deployed files:${NC}"
        ls -la "$vault_path" | grep -E '\.(js|json|css)$' | awk '{print "      " $9 " (" $5 " bytes)"}'
    else
        echo -e "${RED}   ❌ Failed to extract ZIP file to $vault_path${NC}"
        ((FAILED_COUNT++))
    fi
    
    echo
done

# 결과 요약
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}           Deployment Summary${NC}"
echo -e "${BLUE}===========================================${NC}"
echo -e "${GREEN}✅ Successfully deployed: $DEPLOYED_COUNT vaults${NC}"

if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Failed deployments: $FAILED_COUNT vaults${NC}"
    echo -e "${YELLOW}💡 Check the error messages above for details.${NC}"
else
    echo -e "${GREEN}🎉 All deployments completed successfully!${NC}"
fi

echo
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "   1. Open Obsidian vaults"
echo -e "   2. Reload the Summar plugin or restart Obsidian"
echo -e "   3. Verify that the plugin is working correctly"
echo

if [ $FAILED_COUNT -gt 0 ]; then
    exit 1
else
    exit 0
fi
