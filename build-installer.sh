#!/bin/bash

# Summar Plugin Installer 빌드 스크립트

echo "🚀 Summar Plugin Installer 빌드를 시작합니다..."

# 의존성 설치
echo "📦 의존성 설치 중..."
cd installer
npm install

# 메인 플러그인 빌드
echo "🔨 Summar 플러그인 빌드 중..."
cd ..
npm run build

# 플러그인 버전을 installer package.json에 동기화
echo "🔄 플러그인 버전을 installer에 동기화 중..."
PLUGIN_VERSION=$(node -p "require('./src/manifest.json').version")
echo "플러그인 버전: $PLUGIN_VERSION"

cd installer
npm version $PLUGIN_VERSION --no-git-tag-version
echo "Installer 버전을 $PLUGIN_VERSION 로 업데이트했습니다"

# 플러그인 파일 복사
echo "📁 플러그인 파일 복사 중..."
cd ..
cp dist/summar.zip installer/plugin/

# 앱 아이콘 생성 (간단한 텍스트 기반 아이콘)
echo "🎨 앱 아이콘 생성 중..."
cd installer

# macOS용 .app 번들 빌드 (Apple Silicon)
echo "📱 macOS 앱 빌드 중 (Apple Silicon)..."
npm run build-mac

echo "✅ 빌드 완료!"
echo "📂 결과물: installer/dist/Summar Plugin Installer.dmg"
echo ""
echo "설치 방법:"
echo "1. .dmg 파일을 더블클릭하여 마운트"
echo "2. 'Summar Plugin Installer' 앱을 Applications 폴더로 드래그"
echo "3. 앱을 실행하여 플러그인 설치"
echo ""
echo "⚠️  Apple Silicon (M1/M2/M3) Mac 전용입니다."
