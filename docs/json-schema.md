# Summar 플러그인 JSON 데이터 구조 정리

---

## manifest.json

플러그인 메타 정보(Obsidian 표준)

- `author`: 플러그인 제작자 이름 (예: "Snow Kwon")
- `authorUrl`: 제작자/회사 URL (예: "https://linepluscorp.com")
- `description`: 플러그인 설명 (예: "Summarizes the content of web pages and PDFs using the OpenAI API.")
- `id`: 플러그인 고유 ID (예: "summar")
- `isDesktopOnly`: 데스크탑 전용 여부 (true/false)
- `minAppVersion`: 최소 지원 Obsidian 버전 (예: "0.13.0")
- `name`: 플러그인 이름 (예: "Summar: AI-Powered Summarizer")
- `version`: 플러그인 버전 (예: "1.1.55")

---

## models.json

AI 모델 목록 및 분류

- `model_list`: 모델 그룹별 모델 정보 객체
  - `webModel`, `pdfModel`, `sttModel`, `transcriptSummaryModel`, `customModel`: 각 기능별 모델 그룹
    - `models`: 실제 모델명(key)과 display name(value) 매핑  
      예: `"models": { "gpt-4o": "gpt-4o", "o1-mini": "o1-mini" }`
    - (필요에 따라) `default`: 기본 모델명  
      예: `"default": "gpt-4o"`

---

## prompt.json

각 기능별 기본 프롬프트 텍스트

- `webPrompt`: 웹페이지 요약 기본 프롬프트 (웹페이지 요약에 사용)
- `pdfPrompt`: PDF 요약 기본 프롬프트 (PDF 파일 요약에 사용)
- `sttPrompt`: 음성(STT) 변환 기본 프롬프트 (음성 인식 결과 요약에 사용)
- `transcriptSummaryPrompt`: 녹취 요약 기본 프롬프트 (회의/녹취록 요약에 사용)
- `refineSummaryPrompt`: 녹취 요약 후 refine용 프롬프트 (요약 결과를 추가로 다듬을 때 사용)
- (기타 기능별 프롬프트 키): 향후 확장 가능

---

## model-pricing.json

모델별 과금 정보

- `openai`: OpenAI 모델별 과금 정보 객체
  - 모델명(key): 예) `"gpt-4o"`, `"gpt-4.1"`
    - `inputPerK`: 입력 1K 토큰당 가격(USD, 예: 0.005)
    - `outputPerK`: 출력 1K 토큰당 가격(USD, 예: 0.015)
    - `inputPerMinute`: (음성모델) 1분당 가격(USD, 예: 0.006)
- `gemini`: Gemini 모델별 과금 정보 객체
  - 모델명(key): 예) `"gemini-1.5-pro"`, `"gemini-2.0-pro"`
    - `inputPerK`: 입력 1K 토큰당 가격(USD)
    - `outputPerK`: 출력 1K 토큰당 가격(USD)
    - `audioPerK`: 오디오 1K 토큰당 가격(USD, STT용)

---

## data.json

사용자/플러그인 데이터(설정, 통계 등)

- (SummarSettingTab UI에서 직접 입력받는 주요 키)
  - `openaiApiKey`: OpenAI API 키
  - `openaiApiEndpoint`: OpenAI API 엔드포인트
  - `googleApiKey`: Gemini API 키
  - `confluenceApiToken`: Confluence API 토큰
  - `confluenceDomain`: Confluence 도메인
  - `confluenceParentPageUrl`: Confluence 부모 페이지 URL
  - `confluenceParentPageSpaceKey`: Confluence Space Key
  - `confluenceParentPageId`: Confluence Parent Page ID
  - `useConfluenceAPI`: Confluence API 사용 여부
  - `recordingDir`: 녹음 파일 저장 경로
  - `webPrompt`: 웹페이지 요약 프롬프트
  - `webModel`: 웹페이지 요약 모델명
  - `pdfPrompt`: PDF 요약 프롬프트
  - `pdfModel`: PDF 요약 모델명
  - `sttPrompt`: STT 변환 프롬프트
  - `sttModel`: STT(음성 인식) 모델명
  - `transcriptSummaryPrompt`: 녹취 요약 프롬프트
  - `transcriptSummaryModel`: 녹취 요약 모델명
  - `refineSummaryPrompt`: 요약 refine 프롬프트
  - `refineSummary`: 요약 refine 사용 여부
  - `autoRecordOnZoomMeeting`: Zoom 미팅 자동 녹음 활성화 여부
  - `saveTranscriptAndRefineToNewNote`: 녹취 결과를 새 노트로 저장할지 여부
  - `recordingUnit`: 녹음 단위(초)
  - `recordingLanguage`: 녹취 언어 코드
  - `calendar_count`: 연동된 캘린더 개수
  - `calendar_N`: N번째 캘린더 이름/ID
  - `autoLaunchZoomOnSchedule`: 일정에 따라 Zoom 자동 실행 여부
  - `customModel`: 커스텀 명령 기본 모델명
  - `cmd_count`: 커스텀 명령 개수
  - `cmd_max`: 커스텀 명령 최대 개수
  - `cmd_text_N`: N번째 커스텀 명령의 메뉴 이름
  - `cmd_prompt_N`: N번째 커스텀 명령의 프롬프트
  - `cmd_hotkey_N`: N번째 커스텀 명령의 단축키
  - `cmd_model_N`: N번째 커스텀 명령의 모델명
  - `cmd_append_to_note_N`: N번째 명령 결과 노트 추가 여부
  - `cmd_copy_to_clipboard_N`: N번째 명령 결과 클립보드 복사 여부

- (SummarSettingTab UI와 직접 연결되지 않은 기타 설정/내부용 키)
  - `settingsSchemaVersion`: 설정 스키마 버전
  - `debugLevel`: 디버그 레벨
  - `testUrl`: 테스트용 URL
  - `calendar_fetchdays`: 캘린더 이벤트 조회 기간(일 단위)
  - `calendar_polling_interval`: 캘린더 이벤트 자동 갱신 주기(ms)
  - `selectedDeviceId`: 선택된 오디오 디바이스 ID
  - `selectedDeviceId_*`: 각 디바이스별 선택된 오디오 디바이스 ID(기기별로 여러 개 존재 가능)

  - `recordingResultNewNote`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `transcriptSTT`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `transcribingPrompt`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `transcriptModel`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `recordingPrompt`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `refiningPrompt`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `systemPrompt`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `userPrompt`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `confluenceBaseUrl`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `autoRecording`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `resultNewNote`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `transcriptEndpoint`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)
  - `calendar_zoom_only`: (이전 버전 호환, 1.0.0 이전 설정에서만 사용, 이후 버전에서는 제거됨)

- (UI에서 입력받지 않는/내부용 키)
  - `deviceId`: 내부적으로 할당된 디바이스 식별자
  - `version`: 데이터 구조 버전
  - `userAgent`: 내부적으로 기록되는 user agent
  - `sessionId`: 세션 식별자

## sourcecode

플러그인 실행 중 동적으로 관리되는 값(코드 내부에서만 사용, data.json에 저장/로드하지 않을 수 있음)

  - `deviceId`: 내부적으로 할당된 디바이스 식별자 (각 디바이스 고유값)
  - `version`: 데이터 구조 버전 (마이그레이션/호환성 관리용)
  - `userAgent`: 내부적으로 기록되는 user agent (API 로그 등에서 사용)
  - `sessionId`: 세션 식별자 (API 호출/로그 구분용)
  - `lastStatsUpdate`: 마지막 통계 갱신 시각 (timestamp)
  - `lastPromptUpdate`: 마지막 프롬프트 갱신 시각 (timestamp)
  - `lastModelUpdate`: 마지막 모델 목록 갱신 시각 (timestamp)
  - `apiLogCount`: API 로그 총 개수 (통계용)
  - `apiLogErrorCount`: API 실패 로그 개수 (통계용)
  - `apiLogSuccessCount`: API 성공 로그 개수 (통계용)
  - `apiLogLastError`: 마지막 API 에러 메시지
  - `apiLogLastSuccess`: 마지막 API 성공 메시지
  - `apiLogLastTimestamp`: 마지막 API 호출 시각 (timestamp)
  - `modelPricing`: 동적으로 로딩된 모델별 과금 정보
  - `modelsJson`: 동적으로 로딩된 모델 목록
  - `defaultPrompts`: 동적으로 로딩된 기본 프롬프트
  - `calendarEventsCache`: 캘린더 이벤트 캐시
  - `confluenceCache`: Confluence 관련 캐시

---

**참고:**  
- 각 JSON 파일은 src/ 또는 플러그인 루트에 위치하며, 플러그인 로딩 시 동적으로 읽어와 사용합니다.
- data.json은 UI를 통해 일부 키만 입력받으며, 나머지는 내부적으로만 사용됩니다.