# Summar 플러그인 JSON 데이터 구조 정리

## JSON 파일과 런타임 구조체 매핑

### 파일 로딩 순서 및 의존성

플러그인 로딩 시 다음 순서로 JSON 파일들이 처리됩니다:

1. **`models.json`** → `SummarPlugin.modelsJson` (전체 모델 데이터)
   - 로딩 함수: `loadModelsFromFile()`
   - 추가 매핑: `modelsByCategory`, `defaultModelsByCategory`

2. **`prompts.json`** → `SummarPlugin.defaultPrompts` (기본 프롬프트 참조)
   - 로딩 함수: `loadPromptsFromFile()`
   - 사용자 설정이 비어있을 때만 `settings`에 적용

3. **`model-pricing.json`** → `SummarPlugin.modelPricing` (모델 가격 정보)
   - 로딩 함수: `loadModelPricingFromFile()`

4. **`data.json`** → `SummarPlugin.settings` (사용자 설정)
   - 로딩 함수: `loadSettingsFromFile()`
   - 위 3개 파일의 데이터를 참조하여 기본값 설정

### 매핑 관계

| JSON 파일 | 런타임 속성 | 타입 | 설명 |
|-----------|-------------|------|------|
| `models.json` | `modelsJson` | `ModelData` | 전체 모델 데이터 원본 |
| `prompts.json` | `defaultPrompts` | `DefaultPrompts` | 기본 프롬프트 참조용 |
| `model-pricing.json` | `modelPricing` | `any` | 모델별 가격 정보 |
| `data.json` | `settings` | `PluginSettings` | 사용자 개인 설정 |

### 사용자 설정 보호

- JSON 파일들은 **기본값 제공**용으로만 사용
- 사용자가 이미 설정한 값은 **덮어쓰지 않음**
- 설정이 비어있을 때만 기본값 적용

---

## manifest.json

플러그인 메타 정보(Obsidian 표준)

- `author`: 플러그인 제작자 이름 (예: "Snow Kwon")
- `authorUrl`: 제작자/회사 URL (예: "https://linepluscorp.com")  
- `description`: 플러그인 설명 (예: "Summarizes the content of web pages and PDFs using the OpenAI API.")
- `id`: 플러그인 고유 ID (예: "summar")
- `isDesktopOnly`: 데스크탑 전용 여부 (false - 모바일 지원)
- `minAppVersion`: 최소 지원 Obsidian 버전 (예: "0.13.0")
- `name`: 플러그인 이름 (예: "Summar: AI-Powered Summarizer")
- `version`: 플러그인 버전 (예: "1.1.77")
- `mcwork`: 내부 작업 버전 (예: "1.0.0")

---

## models.json

AI 모델 목록 및 분류 - 각 기능별 사용 가능한 모델과 기본 모델 정의

- `model_list`: 모델 그룹별 모델 정보 객체
  - `webModel`: 웹페이지 요약용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4.1-mini")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `o1-mini`, `o3-mini`
      - `gemini-2.0-flash`, `gemini-2.5-flash`
  - `pdfModel`: PDF 요약용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4o")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`
  - `sttModel`: 음성 인식용 모델 그룹
    - `default`: 기본 모델 (예: "whisper-1")
    - `models`: 사용 가능한 모델 목록
      - `whisper-1`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`
      - `gemini-2.0-flash`, `gemini-2.5-flash`
  - `transcriptSummaryModel`: 녹취 요약용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4.1-mini")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `o1-mini`, `o3-mini`
      - `gemini-2.0-flash`, `gemini-2.5-flash`
  - `customModel`: 커스텀 명령용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4.1-mini")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `o1-mini`, `o3-mini`
      - `gemini-2.0-flash`, `gemini-2.5-flash`
---

## prompts.json

각 기능별 기본 프롬프트 텍스트 - 언어별로 구성된 프롬프트 템플릿

- `default_prompts`: 언어별 기본 프롬프트 객체
  - `ko`: 한국어 프롬프트 (현재 지원 언어)
    - `webPrompt`: 웹페이지 요약 프롬프트 (배열 형태)
      - 웹페이지 내용을 한국어로 요약하는 상세한 지침
      - 마크다운 형식 출력, 제목/볼드 미사용, 불릿 포인트 사용
      - 200자 이내 한 줄, 50줄 이내 요약 제한
    - `pdfPrompt`: PDF 요약 프롬프트 (배열 형태)
      - 여러 PDF 페이지를 마크다운으로 변환하는 지침
      - 페이지 번호 제거, 테이블 태그 사용, 정확한 내용 인식
    - `sttPrompt`: 음성 인식 프롬프트 (배열 형태, 현재 빈 값)
    - `transcriptSummaryPrompt`: 녹취 요약 프롬프트 (배열 형태)
      - STT 원문을 회의록으로 정리하는 상세한 지침
      - 단어 리스트를 참고한 오타 수정
      - 마크다운 형식, 볼드 표현 금지
      - 배경, Executive Summary, 논의 내용, Action Item 구조
    - `refineSummaryPrompt`: 요약 정제 프롬프트 (배열 형태)
      - 회의록 보강 및 누락 내용 추가 지침
      - 기존 포맷 유지하면서 내용 보완

---

## model-pricing.json

모델별 과금 정보 - OpenAI와 Gemini 모델의 토큰당 가격 정보

- `openai`: OpenAI 모델별 과금 정보
  - `gpt-4o`: `{ "inputPerK": 0.005, "outputPerK": 0.015 }`
  - `gpt-4.1`: `{ "inputPerK": 0.01, "outputPerK": 0.03 }`
  - `gpt-4.1-mini`: `{ "inputPerK": 0.003, "outputPerK": 0.009 }`
  - `gpt-4`: `{ "inputPerK": 0.03, "outputPerK": 0.06 }`
  - `gpt-4-turbo`: `{ "inputPerK": 0.01, "outputPerK": 0.03 }`
  - `gpt-3.5-turbo`: `{ "inputPerK": 0.001, "outputPerK": 0.002 }`
  - `o1-mini`: `{ "inputPerK": 0.0011, "outputPerK": 0.0044 }`
  - `o3-mini`: `{ "inputPerK": 0.0011, "outputPerK": 0.0044 }`
  - `whisper-1`: `{ "inputPerMinute": 0.006 }` (음성 모델, 분당 가격)
  - `gpt-4o-transcribe`: `{ "inputPerMinute": 0.006 }`
  - `gpt-4o-mini-transcribe`: `{ "inputPerMinute": 0.006 }`

- `gemini`: Gemini 모델별 과금 정보
  - `gemini-2.5-pro`: 토큰 수에 따른 차등 가격
    - `under200k`: `{ "inputPerK": 0.00125, "outputPerK": 0.01 }`
    - `over200k`: `{ "inputPerK": 0.0025, "outputPerK": 0.015 }`
  - `gemini-2.5-flash`: `{ "inputPerK": 0.0003, "outputPerK": 0.0025, "audioPerK": 0.001 }`
  - `gemini-2.0-flash`: `{ "inputPerK": 0.0001, "outputPerK": 0.0004, "audioPerK": 0.0007 }`
  - `gemini-2.0-latest-lite`: `{ "inputPerK": 0.00005, "outputPerK": 0.0002 }`
  - `gemini-1.5-lite`: `{ "inputPerK": 0.00005, "outputPerK": 0.0002 }`
  - `gemini-1.0-lite`: `{ "inputPerK": 0.00002, "outputPerK": 0.0001 }`

**가격 단위**: USD 기준, K=1000토큰

---

## data.json

사용자 설정 및 플러그인 데이터 - 설정 탭에서 관리되는 모든 설정값

### 스키마 정보
- `settingsSchemaVersion`: 설정 스키마 버전 (string, 현재: "1.0.1")

---

## 탭별 설정 필드

### 1. Common Tab (`common-tab`)
**핵심 API 설정**
- `openaiApiKey`: OpenAI API 키 (string, 기본: "")
- `openaiApiEndpoint`: OpenAI API 엔드포인트 (string, 기본: "")
- `googleApiKey`: Google Gemini API 키 (string, 기본: "")

**Confluence 연동 설정**
- `confluenceApiToken`: Confluence API 토큰 (string, 기본: "")
- `useConfluenceAPI`: Confluence API 사용 여부 (boolean, 기본: true)
- `confluenceDomain`: Confluence 도메인 (string, 기본: "")
- `confluenceParentPageUrl`: 부모 페이지 URL (string, 기본: "")
- `confluenceParentPageSpaceKey`: Space 키 (string, 기본: "")
- `confluenceParentPageId`: 부모 페이지 ID (string, 기본: "")

### 2. Webpage Tab (`webpage-tab`)
- `webModel`: 웹페이지 요약 모델 (string, 기본: "")
- `webPrompt`: 웹페이지 요약 프롬프트 (string, 기본: "")

### 3. PDF Tab (`pdf-tab`) *macOS 데스크탑 전용*
- `pdfModel`: PDF 요약 모델 (string, 기본: "")
- `pdfPrompt`: PDF 요약 프롬프트 (string, 기본: "")

### 4. Recording Tab (`recording-tab`)
**녹음 기본 설정**
- `autoRecordOnZoomMeeting`: Zoom 미팅 자동 녹음 여부 (boolean, 기본: false)
- `selectedDeviceId`: 선택된 오디오 디바이스 ID (string, 기본: "")
- `recordingDir`: 녹음 파일 저장 디렉토리 (string, 기본: "")
- `saveTranscriptAndRefineToNewNote`: 녹취 결과를 새 노트로 저장 여부 (boolean, 기본: true)
- `addLinkToDailyNotes`: Daily Notes에 회의록 링크 추가 여부 (boolean, 기본: true)
- `recordingUnit`: 녹음 단위 초 (number, 기본: 15)
- `recordingLanguage`: 녹취 언어 코드 (string, 기본: "ko-KR")

**음성 인식 및 요약 설정**
- `sttModel`: 음성 인식 모델 (string, 기본: "")
- `sttPrompt`: 음성 인식 프롬프트 (string, 기본: "")
- `transcriptSummaryModel`: 녹취 요약 모델 (string, 기본: "")
- `transcriptSummaryPrompt`: 녹취 요약 프롬프트 (string, 기본: "")
- `refineSummary`: 요약 정제 사용 여부 (boolean, 기본: true)
- `refineSummaryPrompt`: 요약 정제 프롬프트 (string, 기본: "")

### 5. Custom Command Tab (`custom-tab`)
- `cmd_max`: 커스텀 명령어 최대 개수 (number, 기본: 10)
- `cmd_count`: 현재 커스텀 명령어 개수 (number, 기본: 0)
- `cmd_text_N`: N번째 커스텀 명령어 표시명 (string, 동적 키 1~cmd_max)
- `cmd_prompt_N`: N번째 커스텀 명령어 프롬프트 (string, 동적 키 1~cmd_max)
- `cmd_model_N`: N번째 커스텀 명령어 모델 (string, 동적 키 1~cmd_max)
- `cmd_hotkey_N`: N번째 커스텀 명령어 단축키 (string, 동적 키 1~cmd_max)
- `cmd_append_to_note_N`: N번째 명령어 결과 노트 추가 여부 (boolean, 동적 키 1~cmd_max)
- `cmd_copy_to_clipboard_N`: N번째 명령어 결과 클립보드 복사 여부 (boolean, 동적 키 1~cmd_max)

### 6. Schedule Tab (`schedule-tab`) *macOS 데스크탑 전용*
- `calendar_count`: 연동된 캘린더 개수 (number, 기본: 0, 최대: 5)
- `calendar_1` ~ `calendar_5`: 각 캘린더 식별자 (string, 동적 키)
- `calendar_fetchdays`: 캘린더 이벤트 조회 기간 일 (number, 기본: 1)
- `calendar_polling_interval`: 캘린더 자동 갱신 주기 ms (number, 기본: 600000)
- `autoLaunchZoomOnSchedule`: 일정 기반 Zoom 자동 실행 여부 (boolean, 기본: false)
- `autoLaunchZoomOnlyAccepted`: 수락한 일정만 Zoom 자동 실행 여부 (boolean, 기본: true)

### 7. Stats Tab (`stats-tab`)
*이 탭은 설정 필드가 없고 통계 정보만 표시함*

---

## 탭에서 관리하지 않는 설정 필드

### 내부 시스템 설정
- `debugLevel`: 디버그 레벨 0-3 (number, 기본: 0) *코드에서만 참조*
- `testUrl`: 테스트용 URL (string, 기본: "") *개발/테스트용*

### 구버전 호환성 설정 (1.0.0 이전, deprecated)
- `systemPrompt`: 시스템 프롬프트 (string, deprecated, 기본: "")
- `recordingResultNewNote`: 녹취 결과 새 노트 저장 (boolean, deprecated, 기본: true)
- `transcriptSTT`: STT 모델 (string, deprecated → sttModel, 기본: "")
- `transcribingPrompt`: 음성 인식 프롬프트 (string, deprecated → sttPrompt, 기본: "")
- `transcriptModel`: 녹취 모델 (string, deprecated → transcriptSummaryModel, 기본: "")
- `recordingPrompt`: 녹취 프롬프트 (string, deprecated → transcriptSummaryPrompt, 기본: "")
- `refiningPrompt`: 정제 프롬프트 (string, deprecated → refineSummaryPrompt, 기본: "")

**마이그레이션 시 자동 정리되는 추가 deprecated 필드들:**
- `userPrompt`: 사용자 프롬프트 (string, deprecated)
- `confluenceBaseUrl`: Confluence 베이스 URL (string, deprecated)
- `autoRecording`: 자동 녹음 (boolean, deprecated)
- `resultNewNote`: 결과 새 노트 (boolean, deprecated)
- `transcriptEndpoint`: 녹취 엔드포인트 (string, deprecated)
- `calendar_zoom_only`: Zoom 전용 캘린더 (boolean, deprecated)

---

## 런타임 데이터 (메모리에서만 관리)

플러그인 실행 중에만 존재하는 동적 데이터 - data.json에 저장되지 않음

### 플러그인 내부 상태
- `deviceId`: 현재 디바이스 식별자 (고유값)
- `version`: 데이터 구조 버전
- `userAgent`: API 호출 시 사용하는 User-Agent 
- `sessionId`: 현재 세션 식별자

### 캐시 및 로딩된 데이터
- `modelsJson`: models.json에서 로딩된 모델 정보
- `modelPricing`: model-pricing.json에서 로딩된 가격 정보
- `defaultPrompts`: prompts.json에서 로딩된 기본 프롬프트
- `calendarEventsCache`: 캘린더 이벤트 캐시 데이터
- `confluenceCache`: Confluence 관련 캐시 데이터

### 통계 및 로그 정보
- `lastStatsUpdate`: 마지막 통계 갱신 시각 (timestamp)
- `lastPromptUpdate`: 마지막 프롬프트 갱신 시각 (timestamp)
- `lastModelUpdate`: 마지막 모델 목록 갱신 시각 (timestamp)
- `apiLogCount`: API 호출 총 개수
- `apiLogErrorCount`: API 실패 개수
- `apiLogSuccessCount`: API 성공 개수
- `apiLogLastError`: 마지막 API 에러 메시지
- `apiLogLastSuccess`: 마지막 API 성공 메시지
- `apiLogLastTimestamp`: 마지막 API 호출 시각 (timestamp)

---

## 파일 위치 및 관리

### JSON 파일 위치
- `manifest.json`: `/src/manifest.json` (빌드 시 플러그인 루트로 복사)
- `models.json`: `/src/models.json` (빌드 시 플러그인 루트로 복사)
- `prompts.json`: `/src/prompts.json` (빌드 시 플러그인 루트로 복사)
- `model-pricing.json`: `/src/model-pricing.json` (빌드 시 플러그인 루트로 복사)
- `data.json`: `/.obsidian/plugins/summar/data.json` (사용자 설정 저장)

### 로딩 순서
1. `models.json` → 2. `prompts.json` → 3. `model-pricing.json` → 4. `data.json`
- 의존성 순서에 따라 순차적 로딩
- 에러 발생 시 기본값으로 fallback

### 설정 마이그레이션
- 설정 스키마 버전 `settingsSchemaVersion`으로 관리
- 1.0.0 이전 버전에서 업그레이드 시 자동 변환
- 구버전 키는 새 키로 매핑 후 제거

---

**참고사항:**
- 모든 JSON 파일은 플러그인 로딩 시 동적으로 읽어와 사용됩니다
- `data.json`만 사용자 설정을 저장하며, 나머지는 읽기 전용입니다
- 설정 변경 시 `data.json`에만 저장되고, 다른 JSON 파일은 플러그인 업데이트 시에만 변경됩니다