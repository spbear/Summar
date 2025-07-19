#!/bin/bash
# Swift 모듈 충돌 문제 해결을 위한 래퍼 스크립트
# 이 스크립트는 fetch_calendar.swift 파일을 실행하기 전에 
# Swift 환경을 확인하고 적절한 해결책을 제공합니다.
# 또한 일반적인 Swift 설치 문제와 권한 문제를 감지하여 사용자에게 안내합니다.
#
# 사용법:
# 1. 기본 사용: fetch_calendar_wrapper.sh [인자...]
# 2. 환경 진단: fetch_calendar_wrapper.sh --check-environment

# 에러 처리 함수
handle_error() {
    echo "ERROR: $1" >&2
    echo '{"error":"'"$1"'"}' # 표준 출력으로 JSON 에러 메시지 반환
    exit 1
}

# 권한 에러 처리 함수
handle_permission_error() {
    echo "ERROR: $1" >&2
    echo "-1" # 권한 거부 표시를 위한 특별 코드
    exit 1
}

# 모듈 충돌 에러 처리 함수
handle_module_conflict() {
    echo "MODULE_CONFLICT: $1" >&2
    echo "-2" # 모듈 충돌 표시를 위한 특별 코드
    exit 1
}

# Swift 환경 진단 함수
check_swift_environment() {
    # 간단한 Swift 코드 생성 (최소한의 import만 포함)
    local TMP_DIR=$(mktemp -d)
    local TEST_SCRIPT="$TMP_DIR/test_environment.swift"
    
    cat > "$TEST_SCRIPT" << 'EOF'
import Foundation
import EventKit

print("ENVIRONMENT_OK")
EOF
    
    # 테스트 스크립트 실행
    local TEST_OUTPUT=$(swift "$TEST_SCRIPT" 2>&1)
    local TEST_EXIT_CODE=$?
    
    # 임시 파일 정리
    rm -rf "$TMP_DIR"
    
    # 결과 확인
    if [[ $TEST_EXIT_CODE -eq 0 ]] && [[ "$TEST_OUTPUT" == *"ENVIRONMENT_OK"* ]]; then
        echo "Swift 환경이 정상입니다."
        return 0
    elif [[ "$TEST_OUTPUT" == *"redefinition of module 'SwiftBridging'"* ]]; then
        handle_module_conflict "Swift 모듈 충돌이 감지되었습니다. 다음 명령어를 실행하여 문제를 해결하세요:

    sudo xcode-select --reset
    sudo xcodebuild -runFirstLaunch

그 후 Obsidian을 재시작하세요."
    else
        handle_error "Swift 환경에 문제가 있습니다: $(echo "$TEST_OUTPUT" | head -n 3)"
    fi
}

# 경로 설정
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SWIFT_SCRIPT="$SCRIPT_DIR/fetch_calendar.swift"

# 환경 진단 모드 확인
if [[ "$1" == "--check-environment" ]]; then
    # Swift가 설치되어 있는지 확인
    if ! command -v swift &> /dev/null; then
        handle_error "Swift compiler not found. Please install Swift to use calendar features."
    fi
    # 환경 진단 실행
    check_swift_environment
    exit 0
fi

# Swift 스크립트가 존재하는지 확인
if [ ! -f "$SWIFT_SCRIPT" ]; then
    handle_error "Swift script not found at: $SWIFT_SCRIPT"
fi

# Swift 컴파일러 확인
if ! command -v swift &> /dev/null; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    INSTALLER_PATH="$SCRIPT_DIR/install_swift.sh"
    
    # 설치 스크립트가 존재하는지 확인
    if [ -f "$INSTALLER_PATH" ] && [ -x "$INSTALLER_PATH" ]; then
        # 사용자에게 자동 설치 옵션 제공
        echo "Swift가 설치되어 있지 않습니다. 자동으로 설치하시겠습니까? (y/n):"
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Swift 설치를 시작합니다..."
            # 설치 스크립트 실행
            "$INSTALLER_PATH"
            
            # 설치 후 다시 Swift 확인
            if ! command -v swift &> /dev/null; then
                handle_error "Swift 설치가 완료되었으나 아직 사용할 수 없습니다. 터미널을 다시 시작한 후 Obsidian을 재시작해주세요."
            fi
        else
            handle_error "Swift compiler not found. Install Swift to use calendar features. You can:

1. Run our automatic installer: $INSTALLER_PATH
2. Install Swift manually from https://www.swift.org/download/

Restart Obsidian after installation."
        fi
    else
        handle_error "Swift compiler not found. Install Swift to use calendar features. You can:

1. Install Swift toolchain (recommended, smaller download):
   - Visit https://www.swift.org/download/ and download Swift for macOS
   - Follow the installation instructions

2. Install Xcode Command Line Tools (alternative):
   - Open Terminal and run: xcode-select --install
   
Restart Obsidian after installation."
    fi
fi

# Swift 버전 확인 출력
SWIFT_VERSION=$(swift --version 2>&1)
if [[ $? -ne 0 ]]; then
    handle_error "Failed to get Swift version: $SWIFT_VERSION"
fi

# 기존 문제를 해결하기 위한 임시 파일 생성
TMP_DIR=$(mktemp -d)
TMP_SWIFT="$TMP_DIR/temp_calendar.swift"

# 원본 스크립트 내용을 임시 파일에 복사
cat "$SWIFT_SCRIPT" > "$TMP_SWIFT"

# 임시 스크립트 실행 (권한 관련 오류 감지)
OUTPUT=$(swift "$TMP_SWIFT" "$@" 2>&1)
EXIT_CODE=$?

# 권한 관련 오류 문자열 확인
if [[ $OUTPUT == *"This app doesn't have permission to use"* ]] || \
   [[ $OUTPUT == *"You previously denied access"* ]] || \
   [[ $OUTPUT == *"The authentication operation was canceled"* ]] || \
   [[ $OUTPUT == *"is not authorized for EKEntityType"* ]]; then
    handle_permission_error "Calendar permission denied. Please grant access to calendars in System Settings > Privacy & Security."
fi

# 임시 파일 정리
rm -rf "$TMP_DIR"

# 모듈 충돌 에러 감지 및 처리
if [[ $EXIT_CODE -ne 0 ]] && [[ "$OUTPUT" == *"redefinition of module 'SwiftBridging'"* ]]; then
    # 사용자에게 문제 해결 안내
    if command -v xcode-select &> /dev/null; then
        # Xcode Command Line Tools가 설치된 경우
        handle_error "Module conflict detected. Please run the following commands in Terminal to fix the issue:

    sudo xcode-select --reset
    sudo xcodebuild -runFirstLaunch
    
Then restart Obsidian and try again."
    else
        # 독립형 Swift 툴체인을 사용하는 경우
        handle_error "Swift module conflict detected. If you're using Swift standalone toolchain:

1. Check that your Swift installation is properly configured
2. Try reinstalling the Swift toolchain from https://www.swift.org/download/
3. Make sure your PATH is correctly set in your .zshrc or .bash_profile
    
Then restart Obsidian and try again."
    fi
fi

# 일반적인 Swift 컴파일/실행 오류 처리
if [[ $EXIT_CODE -ne 0 ]]; then
    # 권한 관련 오류가 아닌 일반적인 오류 처리
    if [[ $OUTPUT == *"unable to load calendar data"* ]] || \
       [[ $OUTPUT == *"failed to get calendar access"* ]]; then
        handle_permission_error "Failed to access calendar data. Please check calendar permissions."
    else
        # 일반적인 오류 처리
        handle_error "Swift script execution failed: $(echo "$OUTPUT" | head -n 3)"
    fi
fi

# 성공적인 실행 결과를 표준 출력으로 전달
echo "$OUTPUT"
exit 0