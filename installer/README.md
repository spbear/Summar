# Summar Plugin Installer

macOS용 Obsidian Summar 플러그인 GUI 설치 프로그램입니다.

## 기능

- 🔍 **자동 Vault 탐지**: 시스템에서 Obsidian vault를 자동으로 찾아줍니다
- 📁 **수동 폴더 선택**: 직접 vault 폴더를 선택할 수 있습니다
- ⚡ **원클릭 설치**: 간단한 클릭으로 플러그인을 설치합니다
- 🎨 **Beautiful UI**: macOS 네이티브 스타일의 아름다운 사용자 인터페이스
- ✅ **설치 가이드**: 설치 후 활성화 방법을 친절하게 안내합니다

## 빌드 방법

### 요구사항
- Node.js 16 이상
- npm

### 빌드 명령

```bash
# 의존성 설치 및 빌드
./build-installer.sh
```

또는 수동으로:

```bash
# 1. 설치 프로그램 의존성 설치
cd installer
npm install

# 2. 메인 플러그인 빌드
cd ..
npm run build

# 3. 플러그인 파일 복사
cp dist/summar.zip installer/plugin/

# 4. macOS 앱 빌드
cd installer
npm run build-mac
```

### 결과물

빌드가 완료되면 `installer/dist/` 폴더에 다음 파일들이 생성됩니다:
- `Summar Plugin Installer.dmg` - macOS 설치 파일

## 사용 방법

1. `.dmg` 파일을 더블클릭하여 마운트
2. `Summar Plugin Installer` 앱을 Applications 폴더로 드래그
3. 앱을 실행
4. 화면의 지시에 따라 Obsidian vault 선택
5. 플러그인 설치 진행
6. Obsidian에서 플러그인 활성화

## 설치 후 설정

1. Obsidian 실행
2. 설정 → 커뮤니티 플러그인으로 이동
3. "Summar" 플러그인 활성화
4. API 키 설정 후 사용 시작

## 기술 스택

- **Electron**: 크로스플랫폼 데스크톱 앱 프레임워크
- **HTML/CSS/JavaScript**: 사용자 인터페이스
- **Node.js**: 파일 시스템 조작 및 설치 로직
- **electron-builder**: macOS .app 번들 및 .dmg 생성

## 폴더 구조

```
installer/
├── package.json          # Electron 앱 설정
├── src/
│   ├── main.js           # Electron 메인 프로세스
│   ├── preload.js        # 보안 컨텍스트 브릿지
│   ├── index.html        # 메인 UI
│   ├── styles.css        # 스타일시트
│   └── renderer.js       # 렌더러 프로세스 로직
├── plugin/
│   └── summar.zip        # 설치할 플러그인 파일
└── assets/
    └── icon.icns         # 앱 아이콘
```

## 라이센스

MIT License
