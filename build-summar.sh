#!/bin/bash

# Summar 통합 빌드 스크립트
# 다양한 빌드 및 테스트 옵션을 제공합니다

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 로고 출력
print_logo() {
    echo -e "${CYAN}"
    echo "  ____                                  "
    echo " / ___| _   _ _ __ ___  _ __ ___   __ _ _ __"
    echo " \___ \| | | | '_ \` _ \| '_ \` _ \ / _\` | '__|"
    echo "  ___) | |_| | | | | | | | | | | | (_| | |   "
    echo " |____/ \__,_|_| |_| |_|_| |_| |_|\__,_|_|   "
    echo ""
    echo "       통합 빌드 & 테스트 스크립트"
    echo -e "${NC}"
}

# 현재 디렉토리 확인
check_directory() {
    if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
        echo -e "${RED}❌ Summar 프로젝트 루트 디렉토리에서 실행해주세요.${NC}"
        exit 1
    fi
}

# 메뉴 표시
show_menu() {
    echo -e "${GREEN}🔧 사용 가능한 빌드 & 테스트 옵션:${NC}"
    echo ""
    
    # Plugin 관련
    echo -e "${BLUE}📦 Summar Plugin:${NC}"
    echo "  1) Summar Plugin 빌드"
    echo "  2) Summar Plugin 개발 빌드 (watch mode)"
    echo ""
    
    # 테스트 관련
    echo -e "${PURPLE}🧪 테스트:${NC}"
    echo "  3) 전체 테스트 실행"
    echo "  4) 단위 테스트만"
    echo "  5) 통합 테스트만"
    echo "  6) E2E 테스트"
    echo "  12) 테스트 커버리지 리포트"
    echo ""
    
    # 파이프라인
    echo -e "${YELLOW}🚀 통합 파이프라인:${NC}"
    echo "  7) 빌드 + 테스트 파이프라인"
    echo "  8) 로컬 배포 (Obsidian)"
    echo "  9) 빌드 + 테스트 + 배포"
    echo ""
    
    # Installer 관련
    echo -e "${CYAN}📱 Summar Installer:${NC}"
    echo "  10) Summar Installer 빌드 (Xcode)"
    echo "  11) DMG 생성"
    echo ""
    
    # 유틸리티
    echo -e "${GREEN}🛠️  유틸리티:${NC}"
    echo "  13) Obsidian 재시작"
    echo "  14) 프로젝트 정리"
    echo "  15) 의존성 설치"
    echo ""
    
    echo -e "${RED}  0) 종료${NC}"
    echo ""
}

# 메뉴 옵션 가져오기
get_menu_option() {
    local key=$1
    case $key in
        "1") echo "Summar Plugin 빌드|npm run build" ;;
        "2") echo "Summar Plugin 개발 빌드|npm run dev" ;;
        "3") echo "전체 테스트 실행|npm run test:all" ;;
        "4") echo "단위 테스트만|npm run test:unit" ;;
        "5") echo "통합 테스트만|npm run test:integration" ;;
        "6") echo "E2E 테스트|npm run test:e2e" ;;
        "7") echo "빌드 + 테스트 파이프라인|npm run build:test" ;;
        "8") echo "로컬 배포 (Obsidian)|./scripts/deploy-local.sh" ;;
        "9") echo "빌드 + 테스트 + 배포|./scripts/build-and-test.sh" ;;
        "10") echo "Summar Installer 빌드 (Xcode)|xcodebuild -project \"Summar Installer/Summar Installer.xcodeproj\" -scheme \"Summar Installer\" -configuration Release clean build" ;;
        "11") echo "DMG 생성|./build-installer.sh" ;;
        "12") echo "테스트 커버리지 리포트|npm run test:coverage" ;;
        "13") echo "Obsidian 재시작|npm run obsidian:reload" ;;
        "14") echo "프로젝트 정리|npm run clean" ;;
        "15") echo "의존성 설치|npm install" ;;
        *) echo "" ;;
    esac
}

# 명령어 실행
execute_command() {
    local option=$1
    local command_info=$(get_menu_option "$option")
    
    if [[ -z "$command_info" ]]; then
        echo -e "${RED}❌ 잘못된 옵션입니다.${NC}"
        return 1
    fi
    
    local description=$(echo "$command_info" | cut -d'|' -f1)
    local command=$(echo "$command_info" | cut -d'|' -f2)
    
    echo -e "${YELLOW}🚀 실행 중: $description${NC}"
    echo -e "${BLUE}명령어: $command${NC}"
    echo ""
    
    # 특별 처리가 필요한 명령어들
    case $option in
        "2")
            echo -e "${YELLOW}⚠️  개발 모드는 Ctrl+C로 중단할 수 있습니다.${NC}"
            ;;
        "10")
            echo -e "${YELLOW}⚠️  Xcode가 설치되어 있어야 합니다.${NC}"
            ;;
        "11")
            if [[ ! -f "build-installer.sh" ]]; then
                echo -e "${RED}❌ build-installer.sh 파일을 찾을 수 없습니다.${NC}"
                return 1
            fi
            ;;
    esac
    
    # 명령어 실행
    eval "$command"
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        echo ""
        echo -e "${GREEN}✅ '$description' 완료!${NC}"
    else
        echo ""
        echo -e "${RED}❌ '$description' 실패 (종료 코드: $exit_code)${NC}"
    fi
    
    return $exit_code
}

# 메인 실행 루프
main() {
    print_logo
    check_directory
    
    while true; do
        show_menu
        echo -n "옵션을 선택하세요 (0-15): "
        read -r choice
        echo ""
        
        case $choice in
            0)
                echo -e "${GREEN}👋 빌드 스크립트를 종료합니다.${NC}"
                exit 0
                ;;
            [1-9]|1[0-5])
                execute_command "$choice"
                echo ""
                echo -e "${CYAN}계속하려면 Enter를 누르세요...${NC}"
                read -r
                clear
                print_logo
                ;;
            *)
                echo -e "${RED}❌ 잘못된 입력입니다. 0-15 사이의 숫자를 입력해주세요.${NC}"
                echo ""
                ;;
        esac
    done
}

# 스크립트 실행
main "$@"
