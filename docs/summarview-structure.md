# SummarView UI Structure

본 문서는 Obsidian Summar 플러그인의 SummarView(UI 타입: `summar-view`) 레이아웃과 실제 DOM 계층 구조를 정리한 자료입니다. 시각화를 포함해 컨테이너 구성, 반응형/플랫폼 분기, Sticky Header, Composer, 이벤트 위임, 상태 모델을 한눈에 파악할 수 있도록 작성했습니다.

## 전체 개요
- 상단: 버튼바(업로드/도구/메뉴/레코드)
- 중앙: 출력 영역(Output Container, 스크롤 가능) — 여러 Output Item(헤더 + 본문 + 대화 아이템)
- 하단: Composer(대화 입력 UI, 기본 숨김, Splitter로 높이 조절)
- 보조: Sticky Header(스크롤 시 떠 있는 헤더), 오버레이 메뉴(상단 메뉴/헤더 숨김 버튼 메뉴)

주요 생성 지점:
- View 엔트리/컨테이너 초기화: `src/view/SummarView.ts`
- 버튼/출력/Composer 컨테이너 렌더: `src/view/SummarUIRenderer.ts`
- Output Item/헤더/본문 렌더: `src/view/SummarOutputManager.ts`, `src/view/SummarHeader.ts`
- Sticky Header: `src/view/SummarStickyHeaderManager.ts` (SummarHeader 재사용)
- Composer: `src/view/SummarComposerManager.ts`
- 이벤트 위임: `src/view/SummarContainerEventHandler.ts` (툴바/팝업), `src/view/SummarItemEventHandler.ts` (아이템), `src/view/SummarComposerEventHandler.ts` (컴포저)
- 스타일 주입: `src/view/SummarStyleManager.ts`

---

## 실제 DOM 계층 구조(전체 뷰)
다음은 `SummarView.renderView()` 호출 이후 컨테이너 내부의 실제 DOM 배치입니다.

```typescript
.containerEl[data-summar-view="true"].summar-view-container
- div.summar-button-container
  - button.lucide-icon-button[aria-label="Upload Note to Confluence"]           ← Upload Wiki
  - button.lucide-icon-button[aria-label^="Send Slack Message"|"Create Slack Canvas"] ← Upload Slack
  - button.lucide-icon-button[button-id="summarview-menu-button"]               ← View 메뉴
  - span.button-separator |
  - button.lucide-icon-button[aria-label="Convert PDF to Markdown"]             ← PDF
  - button.lucide-icon-button[aria-label="Fetch and summarize the web page"]    ← Web
  - button.summarview-button[button-id="record-button"] "[●] record"            ← Record

- div.summarview-output                                                   ← 스크롤 컨테이너
  - div.output-item[output-key="..."] (여러 개)
    - div.output-header[data-label="..."]
      - div.output-label-chip
        - span.output-label-icon (선택)
        - span.output-label-text (라벨)
      - button.lucide-icon-button[aria-label="Upload ...", button-id?]
      - button.lucide-icon-button[aria-label="Upload ...", button-id?]
      - button.lucide-icon-button[aria-label="Create new note",  button-id="new-note-button"]
      - button.lucide-icon-button[aria-label="reply",           button-id="reply-output-button"]
      - button.lucide-icon-button[aria-label^="Toggle fold",    button-id="toggle-fold-button"]
      - button.lucide-icon-button[aria-label="Copy ...",        button-id="copy-output-button"]
      - div (spacer)
      - button.lucide-icon-button[aria-label="Show menu",       button-id="show-menu-button"]
    - div.output-text
    - div.conversation-item[data-role="user|assistant" data-type="conversation|output|notesync"] (0개 이상, append 순서대로)

- div.composer-splitter                                          ← 컴포저 위 분리바(뷰 컨테이너의 자식)
- div.summarview-composer
  - div.composer-header[data-label="compose prompt"|"reply to: ..."]
    - (좌) div.composer-label-chip (아이콘 + 텍스트)
    - (좌) div.composer-model-chip[data-model="..."] (클릭 시 모델 드롭다운)
    - (우) div (spacer)
    - (우) button[button-id="composer-clear-button"] (trash-2 아이콘)
    - (우) button[button-id="composer-close-button"] (x 아이콘)
  - textarea.composer-prompt-editor (Enter 전송, IME 조합 중 제외)

- div.sticky-header-container.sticky-header[data-key="..."]    ← 떠 있는 헤더 레이어(필요 시 생성/표시)
  - div.output-header[data-label="..."] (Sticky 복제 헤더)
    - SummarHeader 생성으로 원본과 동일한 버튼/모델칩 구성
    - reply/copy/new-note 등은 responsive 정책에 따라 data-responsive-ready 속성과 함께 토글됨
```

보조 오버레이(문서 `<body>` 직속):
```text
.body
- div.summarview-popup-menu                       ← 상단 메뉴 버튼 클릭 시
- div.output-header-hidden-menu                   ← 헤더 메뉴/Sticky 메뉴에서 숨겨진 버튼 대체 메뉴

SummarView 메뉴 버튼(`button-id="summarview-menu-button"`)은 2025-09 업데이트 이후 기본적으로 다음 항목을 제공합니다.
- 숨겨진 헤더 버튼들(반응형 정책으로 접힌 항목) — menu 최상단에 아이콘과 함께 노출
- `New prompt` (Composer 가용 시): 즉시 새 대화 Composer 열기
- `Load conversations`: `conversations/` 디렉토리의 JSON을 가져와 뷰에 복원
- `Clear all conversations`: 비동기로 모든 output/conversation 정리 (`clearAllOutputItems()` 호출)
```

---

## 시각화(ASCII 다이어그램)

### 1) 전체 레이아웃 개요
```text
+-------------------------------------------------------------------+
| SummarView (containerEl .summar-view-container)                    |
|  ┌ Toolbar (.summar-button-container) ──────────────────────────┐  |
|  | Wiki | Slack | Menu | | PDF | Web | [●] record               |  |
|  └──────────────────────────────────────────────────────────────┘  |
|  ┌ Output (.summarview-output, scrollable) ─────────────────────┐  |
|  |  ┌ OutputItem ────────────────┐                              |  |
|  |  | Header (label+buttons)     | ← 숨김 시 Sticky로 복제       |  |
|  |  | Body  (.output-text)       |                              |  |
|  |  | Conversation items (0..n)  |                              |  |
|  |  └────────────────────────────┘                              |  |
|  |  (repeat …)                                                   |  |
|  └──────────────────────────────────────────────────────────────┘  |
|  ┌ Splitter (drag to resize composer) ──────────────────────────┐  |
|  └──────────────────────────────────────────────────────────────┘  |
|  ┌ Composer (.summarview-composer) ─────────────────────────────┐  |
|  |  Header: [label-chip][model-chip]        [clear][close]      |  |
|  |  Textarea: prompt input (Enter to send)                      |  |
|  └──────────────────────────────────────────────────────────────┘  |
|  [Sticky Header Layer (absolute, above output) - when needed]      |
+-------------------------------------------------------------------+
```

### 2) Output Item 상세
```text
OutputItem
├─ OutputHeader (.output-header, data-label)
│  ├─ LabelChip (.output-label-chip)
│  │  ├─ Icon (.output-label-icon, optional)
│  │  └─ Text (.output-label-text)
│  ├─ Button: Upload Wiki
│  ├─ Button: Upload Slack
│  ├─ Button: New Note
│  ├─ Button: Reply (Composer 가용 시만)
│  ├─ Button: Toggle Fold
│  ├─ Button: Copy
│  ├─ Spacer (flex:1)
│  └─ Button: Menu (숨겨진 버튼 + 표준 메뉴)
├─ OutputText (.output-text)
└─ ConversationItem (.conversation-item) x N (role=user|assistant)
```

### 3) Sticky Header 동작
```text
조건: (a) 해당 Item 본문이 펼쳐짐 AND (b) 원본 헤더가 뷰에서 가려짐 AND (c) Output에 실제 스크롤 가능
표시: containerEl에 absolute 레이어로 .sticky-header-container 추가, 동일한 헤더 DOM 생성/동기화
버튼: Sticky 버튼 클릭 → 원본 버튼 클릭 위임 (Reply는 Composer 사용 가능 시만 표시/활성)
```

---

## 컨테이너/스타일 요약
- 컨테이너 생성 순서: Toolbar → Output → Composer, 이후 Composer가 Splitter를 containerEl 상에서 Composer 앞에 삽입, Sticky 레이어는 containerEl 말단에 추가
- Output 높이: 뷰 크기에서 툴바/상태바/Composer(표시 시) 높이를 뺀 값으로 동적 계산
- 스타일 주입: `SummarStyleManager`가 sticky 레이어와 텍스트 영역 선택/가독성에 대한 핵심 CSS 주입

---

## 반응형/플랫폼 분기
- Toolbar(상단 버튼바): 컨테이너 폭 감시(ResizeObserver)
  - Slack 280px↓, Wiki 245px↓ 우선 숨김 — 한 줄 유지
  - macOS 데스크톱 외 환경: Upload/PDF 숨김, Record가 가로폭 확장
- Output Header 내부 버튼: 헤더 폭 기준 단계적 숨김
  - 숨김 순서: Copy → Reply(Composer 가능 시만 표시) → NewNote → UploadSlack → UploadWiki

---

## Composer
- 구성: Header(라벨칩, 모델칩, clear/close) + Textarea
- 토글/표시 조건: Reply/메뉴에서 열기, 최소/최대(100–500px) 범위에서 Splitter로 높이 조절
- 전송: Enter(Shift+Enter 줄바꿈), IME 조합 중에는 전송 무시
- 모델칩: 클릭 시 사용 가능한 모델 목록 드롭다운, 선택 반영
- 레이아웃 연동: Composer 표시/리사이즈 시 Output 영역 높이 실시간 재계산

---

## 이벤트 위임 요약
- 컨테이너 레벨: PDF 변환, Web 요약, Record 토글, Upload(Wiki/Slack), View 메뉴(Load/Save/Clear/Composer)
- 아이템 레벨: 토글/복사/새 노트/삭제 등 Output Item 관련 동작
- Sticky/Composer: 스크롤/리사이즈 이벤트를 AbortController 로 안전 관리, 상태 변화 시 하이라이트/버튼 동기화
- 메뉴 항목 중 `Load conversations`는 conversations 디렉토리에서 JSON을 선택/적용하며, `Clear all conversations`는 비동기 정리를 수행

---

## 상태/데이터 모델
- `SummarOutputRecord`: DOM 참조, 라벨, 노트명, 접힘 상태, 대화(conversations: conversation/output/notesync), 동기화 플래그(syncNote), 통계 ID(statId) 및 임시 결과(_tempResult) 관리
  - 최종 결과는 `OUTPUT`/`NOTESYNC` 타입 메시지로 보관, 중간 결과는 `_tempResult`로 분리
  - import/export 시 원본 파일명을 보존하여 대화 복원 시 동일한 맥락 연결
- `context.outputRecords: Map<string, SummarOutputRecord>` — 모든 Output Item의 단일 소스
- `SummarOutputManager.originalImportFilename`: 가장 처음 로드한 conversation 파일명을 저장, 이후 저장/불러오기에 활용

---

## 대화 보관 & 로드 흐름 (2025-09 업데이트)
- 모든 대화는 `conversations/` 폴더에 `summar-conversations-YYYYMMDD-HHMMSS.json` 형식으로 저장됩니다.
- SummarContainerEventHandler 메뉴에서 `Load conversations`를 실행하면 폴더 내 최신 파일을 검색해 `SummarOutputManager.importOutputItemsFromPluginDir()`로 주입합니다.
- 노트 연동 대화(`NOTESYNC`)는 로드 시 `context: [[Note Title]](key)` 정보를 출력 본문에 삽입하고, 헤더에서 note 버튼을 활성화합니다.
- `cleanupRetentionMinutes` 설정(Conversation 탭)이 주기적으로 오래된 conversation 파일을 삭제하여 디렉토리를 정리합니다.
- `Clear all conversations`는 outputRecords, DOM, conversations 폴더 상태를 동기화하며 비동기 Promise로 처리되어 UI가 잠기지 않습니다.

---

## 파일 맵(참고)
- View 엔트리/컨테이너: `src/view/SummarView.ts`
- 버튼/출력/Composer 컨테이너 UI: `src/view/SummarUIRenderer.ts`
- Output Item/헤더/본문: `src/view/SummarOutputManager.ts`, `src/view/SummarHeader.ts`
- Sticky Header: `src/view/SummarStickyHeaderManager.ts`
- Composer: `src/view/SummarComposerManager.ts`
- 이벤트 핸들러: `src/view/SummarContainerEventHandler.ts`, `src/view/SummarItemEventHandler.ts`, `src/view/SummarComposerEventHandler.ts`
- 스타일: `src/view/SummarStyleManager.ts`
- 메뉴/아이콘 헬퍼: `src/view/SummarMenuUtils.ts`

---

## 추가 메모
- Sticky Header는 원본 헤더 크기/위치를 실측하여 완전히 겹치도록 배치합니다(absolute, z-index 높은 레이어). 버튼 상태/가시성을 원본과 동기화하며, 클릭은 원본으로 위임됩니다.
- Sticky/원본 헤더는 SummarHeader 컴포넌트를 공유하므로 모델칩 선택, 버튼 숨김 정책, 하이라이트(setHeaderHighlight/clearHeaderHighlight) 로직이 완전히 일치합니다.
- Reply 버튼은 항상 Composer 가용성(canShowComposer)에 연동되어 노출/활성화가 결정됩니다.
- 메뉴(헤더/Sticky/상단)는 모두 body 레벨 fixed 오버레이로 생성되어 공간 제약을 받지 않습니다.
- NOTESYNC 응답이 존재하면 `context: [[Note Title]](key)` 포맷으로 본문에 삽입되고 헤더 버튼이 자동으로 활성화됩니다.
