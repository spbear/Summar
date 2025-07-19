#!/bin/bash
# Swift 독립 실행형 툴체인 자동 설치 스크립트

# 오류 발생 시 스크립트 종료
set -e

# 함수: 사용자에게 정보 표시
info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

# 함수: 오류 메시지 출력 및 종료
error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1" >&2
    exit 1
}

# 함수: 경고 메시지 출력
warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1" >&2
}

# 함수: 성공 메시지 출력
success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

# 함수: 사용자에게 질문 (Y/N)
confirm() {
    while true; do
        read -p "$1 (y/n): " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Y 또는 N을 입력해주세요.";;
        esac
    done
}

# Swift가 이미 설치되어 있는지 확인
if command -v swift &> /dev/null; then
    SWIFT_VERSION=$(swift --version | head -n 1)
    info "Swift가 이미 설치되어 있습니다: $SWIFT_VERSION"
    if confirm "이미 설치된 Swift를 사용하시겠습니까?"; then
        success "기존 Swift를 사용합니다. Obsidian을 재시작하면 캘린더 기능을 사용할 수 있습니다."
        exit 0
    fi
    info "새로운 Swift 툴체인을 설치합니다."
fi

# OS 정보 확인
OS_NAME=$(uname)
if [ "$OS_NAME" != "Darwin" ]; then
    error "이 스크립트는 macOS에서만 동작합니다."
fi

OS_VERSION=$(sw_vers -productVersion)
ARCH=$(uname -m)

info "macOS 버전: $OS_VERSION"
info "아키텍처: $ARCH"

# 임시 디렉토리 생성
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# 다운로드할 Swift 버전 및 URL 결정
# 최신 안정 버전의 Swift를 다운로드 (ARM64/Intel 아키텍처에 따라 다름)
# Swift 웹사이트에서 최신 안정 버전 URL
if [ "$ARCH" = "arm64" ]; then
    SWIFT_URL="https://download.swift.org/swift-5.9-release/xcode/swift-5.9-RELEASE/swift-5.9-RELEASE-osx.pkg"
    SWIFT_PKG="$TEMP_DIR/swift-5.9-RELEASE-osx.pkg"
else
    SWIFT_URL="https://download.swift.org/swift-5.9-release/xcode/swift-5.9-RELEASE/swift-5.9-RELEASE-osx.pkg"
    SWIFT_PKG="$TEMP_DIR/swift-5.9-RELEASE-osx.pkg"
fi

info "Swift 툴체인 다운로드 중... ($SWIFT_URL)"
info "이 과정은 다운로드 속도에 따라 몇 분 정도 소요될 수 있습니다."
info "다운로드 위치: $SWIFT_PKG"
if ! curl -L -o "$SWIFT_PKG" "$SWIFT_URL" --fail; then
    error "Swift 툴체인 다운로드에 실패했습니다. URL: $SWIFT_URL"
fi

# 다운로드한 파일이 존재하는지 확인
if [ ! -f "$SWIFT_PKG" ] || [ ! -s "$SWIFT_PKG" ]; then
    error "Swift 툴체인 파일이 제대로 다운로드되지 않았습니다. 파일 경로: $SWIFT_PKG"
fi

# 설치 진행
info "Swift 툴체인 설치 중... (관리자 권한 필요)"
if ! sudo installer -pkg "$SWIFT_PKG" -target /; then
    error "Swift 툴체인 설치에 실패했습니다. 파일 경로: $SWIFT_PKG"
fi

# 설치 확인
if ! command -v swift &> /dev/null; then
    warning "Swift 설치가 완료되었으나 PATH에 추가되지 않았습니다."
    warning "터미널을 재시작하거나 다음 명령어를 실행하세요:"
    echo 'export PATH="/usr/bin:$PATH"'
    info "설치 완료 후 Obsidian을 재시작하면 캘린더 기능을 사용할 수 있습니다."
else
    SWIFT_VERSION=$(swift --version | head -n 1)
    success "Swift가 성공적으로 설치되었습니다: $SWIFT_VERSION"
    success "이제 Obsidian을 재시작하면 캘린더 기능을 사용할 수 있습니다."
fi

# 설치 경로 안내
info "Swift는 일반적으로 /usr/bin/swift에 설치됩니다."
info "이제 캘린더 기능을 사용할 수 있습니다. Obsidian을 재시작해주세요."