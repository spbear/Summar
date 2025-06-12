# Summar Transcription Summary 기능 PRD (Product Requirements Document)

## 1. 개요
Summar의 "Transcription Summary" 기능은 오디오 파일(회의/녹음 등) 또는 실시간 녹음을 텍스트로 변환(STT)한 후, 해당 텍스트를 기반으로 회의록 형태의 요약을 자동으로 생성하는 기능입니다. 추가적으로, 요약 결과를 보강(refine)하는 기능도 제공합니다.

## 2. 주요 목적
- 오디오 파일 또는 실시간 녹음에서 텍스트를 추출하고, 이를 바탕으로 회의록을 자동 생성
- 회의록 요약본의 품질을 높이기 위해 refine(보강) 기능 제공
- 결과를 새로운 노트로 저장하거나, 기존 노트에 추가 가능

## 3. 사용자 시나리오
1. 사용자는 오디오 파일을 업로드하거나, 실시간 녹음을 시작합니다.
2. 플러그인은 선택된 STT 모델(Whisper, Gemini 등)로 오디오를 텍스트로 변환합니다.
3. 변환된 텍스트는 transcriptSummaryPrompt에 따라 AI 모델(OpenAI 등)로 요약됩니다.
4. 요약본은 사용자의 설정에 따라 refineSummaryPrompt로 추가 보강될 수 있습니다.
5. 결과는 새로운 노트로 저장하거나, 기존 노트에 추가할 수 있습니다.

## 4. 주요 기능 및 요구사항
### 4.1 오디오 → 텍스트(STT)
- 다양한 STT 모델 지원: Whisper, Gemini, Google Speech-to-Text 등
- 언어 선택 가능(ko-KR, en-US 등)
- SRT 포맷 등으로 변환 가능

### 4.2 텍스트 → 회의록 요약
- transcriptSummaryPrompt를 기반으로 AI 요약
- 요약 결과는 Markdown 포맷으로 출력
- Action Item, 의사결정 등 별도 구분

### 4.3 요약 보강(Refine)
- refineSummaryPrompt를 기반으로, 요약본과 원본 transcript를 비교하여 보강
- refineSummary 옵션으로 사용 여부 선택 가능

### 4.4 결과 저장 및 활용
- 결과를 새로운 노트로 저장(파일명 자동 생성)
- 기존 노트에 추가, 클립보드 복사 등 옵션 제공

### 4.5 설정 및 커스터마이즈
- STT/요약/보강 프롬프트 직접 수정 가능
- 모델 선택, 임시 폴더 경로, 언어 등 세부 설정 지원
- Zoom 자동 녹음 감지 및 자동 요약 지원

## 5. 관련 설정 항목

- transcriptSummaryModel: 회의록 요약에 사용할 AI 모델을 선택합니다. (예: gpt-4o, o1-mini 등)
- transcriptSummaryPrompt: 회의록 요약을 위한 프롬프트(지침)를 직접 입력/수정할 수 있습니다.
- refineSummary: 요약본 보강(Refine) 기능 사용 여부를 설정합니다. (ON/OFF)
- refineSummaryPrompt: 요약본 보강 시 사용할 프롬프트(지침)를 입력/수정할 수 있습니다.
- sttModel: 오디오를 텍스트로 변환할 STT 모델을 선택합니다. (예: whisper-1 등)
- sttPrompt: STT(음성→텍스트) 변환 시 사용할 프롬프트(지침)를 입력/수정할 수 있습니다.
- recordingLanguage: 녹음/오디오의 언어를 선택합니다. (예: ko-KR, en-US 등)
- recordingDir: 오디오 및 변환 파일을 저장할 임시 폴더 경로를 지정합니다.
- saveTranscriptAndRefineToNewNote: 요약/보강 결과를 새로운 노트로 저장할지 여부를 설정합니다.
- autoRecordOnZoomMeeting: Zoom 미팅 시작 시 자동으로 녹음을 시작할지 여부를 설정합니다.
- deviceId: 사용할 오디오 입력 장치(마이크)를 선택합니다.
- recordingUnit: 녹음 단위 시간(분)을 설정합니다.

## 6. 예외 및 에러 처리
- API Key 미설정, 파일 미선택, 모델 미설정 등 상황별 안내 메시지 제공
- AI 응답 실패 시 에러 메시지 및 재시도 안내

## 7. 기타
- 기능 확장성(다국어, 다양한 STT/요약 모델 추가 등) 고려
- Obsidian 플러그인 UX에 맞춘 UI/UX 제공

## 8. 추가로 제공되면 좋을 기능 (아이디에이션)

- 실시간 회의 중 자동 요약(라이브 요약) 기능
  - 실시간 음성 스트림을 받아서 일정 간격마다 요약 제공
  - Feasibility: WebRTC/MediaStream 활용 가능, OpenAI 등 API 실시간 호출 비용/속도 고려 필요. Obsidian 환경에서 실시간 스트림 처리 UI/UX 추가 개발 필요. (중간 난이도, 추가 서버/API 비용 발생 가능)
- 회의록 내 발언자(Speaker) 자동 구분 및 태깅
  - 음성 분리(Speaker Diarization) 기술 적용, 텍스트에 화자 정보 삽입
  - Feasibility: Google/Gemini/Whisper 일부 모델에서 지원, 정확도/한국어 지원 한계 있음. 외부 라이브러리 연동 필요. (중간~높은 난이도)
- 회의 주요 키워드/주제 자동 추출 및 태그 추천
  - 요약 결과에서 키워드/주제 추출, 태그 자동 제안
  - Feasibility: OpenAI 등 LLM 프롬프트로 구현 용이, 추가 API 호출 필요. (낮은 난이도)
- 회의록 내 특정 발언/Action Item에 댓글 또는 피드백 기능
  - 노트 내 특정 구간에 코멘트/피드백 추가 UI 제공
  - Feasibility: Obsidian 플러그인 내 커스텀 UI 개발 필요, 기본 기능과의 통합 필요. (중간 난이도)
- 회의록 버전 관리 및 변경 이력 추적
  - 회의록 저장 시 버전별로 변경 이력 관리
  - Feasibility: Obsidian 파일 버전 관리(깃 등) 연동 또는 자체 이력 관리 필요. (중간 난이도)
- 회의록 자동 번역(다국어 지원) 기능
  - 요약본을 다양한 언어로 자동 번역
  - Feasibility: OpenAI, Google Translate API 등 활용 가능, 추가 API 비용 발생. (낮은 난이도)
- 회의록 내 일정/Action Item을 캘린더와 연동하여 자동 등록
  - Action Item 추출 후 캘린더(구글, 애플 등) API로 일정 등록
  - Feasibility: 캘린더 API 연동 필요, 인증/권한 처리 필요. (중간 난이도)
- 회의록 내 특정 키워드/문장 검색 및 하이라이트
  - 노트 내 검색/하이라이트 기능 제공
  - Feasibility: Obsidian 내장 검색/하이라이트 기능 활용 가능, 커스텀 UI로 확장 가능. (낮은 난이도)
- Slack, Teams 등 외부 협업툴과의 연동(회의록 자동 전송)
  - 회의록을 외부 협업툴로 자동 전송
  - Feasibility: 각 서비스 API 연동 필요, 인증/토큰 관리 필요. (중간~높은 난이도)
- 회의록 내 첨부파일(이미지, PDF 등) 자동 인식 및 첨부 지원
  - 회의 중 공유된 파일 자동 첨부/링크
  - Feasibility: Obsidian 파일 관리 기능 활용, 회의 중 파일 감지/연동 로직 필요. (중간 난이도)
- 회의록 품질 평가(예: 요약 정확도, 누락 여부 등) 피드백 기능
  - 사용자가 품질 평가/피드백 입력, 개선에 활용
  - Feasibility: 간단한 UI 추가로 구현 가능, 자동 품질 평가는 LLM 추가 호출 필요. (낮은 난이도)
- 회의록 템플릿 커스터마이즈(회사/팀별 포맷 저장 및 적용)
  - 다양한 템플릿 저장/적용 기능 제공
  - Feasibility: Obsidian 템플릿 플러그인 연동 또는 자체 구현 가능. (낮은 난이도)
- 회의록 내 음성 구간별 재생(오디오와 텍스트 싱크)
  - 텍스트 클릭 시 해당 오디오 구간 재생
  - Feasibility: 오디오 파일과 SRT/타임스탬프 연동 필요, 커스텀 플레이어 UI 개발 필요. (중간~높은 난이도)
- 회의록 작성 후 자동 백업/클라우드 저장(Google Drive 등)
  - 회의록을 클라우드에 자동 저장/백업
  - Feasibility: 각 클라우드 API 연동 필요, 인증/권한 관리 필요. (중간 난이도)
- 회의록 작성 후 자동 알림(이메일, 푸시 등) 발송
  - 회의록 작성 시 자동 알림 전송
  - Feasibility: 이메일/푸시 API 연동 필요, 인증/스팸 이슈 고려. (중간 난이도)

---
*본 문서는 2025-06-12 기준, 현재 구현된 Summar Transcription Summary 기능을 바탕으로 작성되었습니다.*
