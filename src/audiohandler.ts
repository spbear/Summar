import { TFile, TFolder, normalizePath, requestUrl, RequestUrlParam } from "obsidian";
import SummarPlugin from "./main";
import { SummarDebug, SummarRequestUrl, SummarViewContainer, showSettingsTab, getAvailableFilePath } from "./globals";
import { SummarTimer } from "./summartimer";

export class AudioHandler extends SummarViewContainer {
	private timer: SummarTimer;

	constructor(plugin: SummarPlugin) {
		super(plugin);
		this.timer = new SummarTimer(plugin);
	}

	async sendAudioData(files: FileList | File[], givenFolderPath: string = ""): Promise<{ transcriptedText: string, newFilePath: string }> {
		// Only show the audio files that will actually be sent
		const fileArray = Array.from(files);
		const audioFiles = fileArray.filter(file =>
			file.type.startsWith("audio/") ||
			file.name.toLowerCase().endsWith(".mp3") ||
			file.name.toLowerCase().endsWith(".wav") ||
			file.name.toLowerCase().endsWith(".ogg") ||
			file.name.toLowerCase().endsWith(".m4a") ||
			file.name.toLowerCase().endsWith(".webm")
		);
		const fileNames = audioFiles.map(f => (f as any).webkitRelativePath || f.name).join("\n");
		this.updateResultText(`Audio files to be sent:\n${fileNames}\n\nConverting audio to text using [${this.plugin.settings.sttModel}] ...`);
		this.enableNewNote(false);

		let audioList = "";
		let transcriptedText = "";

		// Check if the API key is set
		if (!this.plugin.settings.openaiApiKey) {
			SummarDebug.Notice(0,
				"API key is missing. Please add your API key in the settings."
			);
			return { transcriptedText: "", newFilePath: "" };
		}

		// Convert FileList to an array
		const fileArray2 = Array.from(files);

		// Sort files by their relative path (webkitRelativePath if available, otherwise file name)
		const sortedFiles = fileArray2.sort((a, b) => {
			const pathA = (a as any).webkitRelativePath || a.name;
			const pathB = (b as any).webkitRelativePath || b.name;
			return pathA.localeCompare(pathB);
		});

		// Calculate the common folder path
		let folderPath = "";
		let noteFilePath = "";
		if (!givenFolderPath || givenFolderPath.length===0) {
			if (sortedFiles.length === 1) {
				folderPath  = sortedFiles[0].name.substring(0,sortedFiles[0].name.lastIndexOf('.')) || sortedFiles[0].name;
				noteFilePath = normalizePath(`${this.plugin.settings.recordingDir}`);
				SummarDebug.log(1, `sendAudioData - only one file`)
			} else {
				folderPath = getCommonFolderPath(sortedFiles);
				SummarDebug.log(1, `sendAudioData - Detected folder path: ${folderPath}`); // Debug log
				noteFilePath = normalizePath(`${this.plugin.settings.recordingDir}/${folderPath}`);
			}
		} else {
			noteFilePath = givenFolderPath;
			const match = givenFolderPath.match(/[^\/]+$/);
			folderPath = match ? match[0] : noteFilePath;
			SummarDebug.log(1, `sendAudioData - Given folder path: ${folderPath}`); // Debug log
		}

		SummarDebug.log(1, `sendAudioData - noteFilePath: ${noteFilePath}`);
		SummarDebug.log(1, `Number of sorted files: ${sortedFiles.length}`);

		for (const [index, file] of sortedFiles.entries()) {
			const filePath = (file as any).webkitRelativePath || file.name;
			SummarDebug.log(1, `File ${index + 1}: ${filePath}`);
			if (isAudioFile(file)) {
				const audioFilePath = normalizePath(`${noteFilePath}/${file.name}`);
				SummarDebug.log(1, `audioFilePath: ${audioFilePath}`);

				// Check if the file already exists
				const fileExists = await this.plugin.app.vault.adapter.exists(audioFilePath);
				if (!fileExists) {
					// save the file
					await this.plugin.app.vault.adapter.mkdir(noteFilePath);

					const fileContent = await file.arrayBuffer(); // Read the file as an ArrayBuffer
					const binaryContent = new Uint8Array(fileContent);

					try {
						await this.plugin.app.vault.adapter.writeBinary(audioFilePath, binaryContent);
						SummarDebug.log(1, `File saved at: ${audioFilePath}`);
					} catch (error) {
						SummarDebug.error(1, `Error saving file: ${audioFilePath}`, error);
					}
				} else {
					SummarDebug.log(1, `File already exists: ${audioFilePath}`);
				}

				audioList += `![[${audioFilePath}]]\n`;
				SummarDebug.log(1, `audioList: ${audioList}`);
			}
		}

		this.timer.start();

		// Process files in parallel
		const handler = this;
		// 최대 동시 요청 개수
		const MAX_CONCURRENT = 2;

		// Promise pool로 동시 transcription 제한 (stock 현상 없는 안전한 패턴)
		async function runWithConcurrencyLimit(tasks: (() => Promise<any>)[], limit: number): Promise<any[]> {
			const results: any[] = [];
			let next = 0;
			let active = 0;
			return new Promise((resolve, reject) => {
				function runNext() {
					if (next >= tasks.length && active === 0) {
						resolve(results);
						return;
					}
					while (active < limit && next < tasks.length) {
						const current = next++;
						active++;
						tasks[current]().then((result) => {
							results[current] = result;
							active--;
							runNext();
						}).catch(reject);
					}
				}
				runNext();
			});
		}

		// transcriptionPromises를 함수 배열로 변경
		const audioSortedFiles = sortedFiles.filter(isAudioFile);
		const transcriptionTasks = audioSortedFiles.map((file) => async () => {
			const fileName = file.name;
			const audioFilePath = normalizePath(`${noteFilePath}/${file.name}`);
			SummarDebug.log(1, `audioFilePath: ${audioFilePath}`);
			const match = fileName.match(/_(\d+)s\.(webm|wav|mp3|ogg|m4a)$/); // find
			const seconds = match ? parseInt(match[1], 10) : 0; // convert to seconds

			// 재시도 로직 래퍼
			async function transcribeWithRetry() {
				let lastError = null;
				for (let attempt = 1; attempt <= 3; attempt++) {
					try {
						if (this.plugin.settings.sttModel === "gemini-2.0-flash") {
							const { base64, mimeType } = await this.readFileAsBase64(audioFilePath);
							const transcript = await this.callGeminiTranscription(base64, mimeType) || "";
							SummarDebug.log(3, transcript);
							SummarDebug.log(1, 'seconds: ', seconds);
							const strContent = this.adjustSrtTimestamps(transcript, seconds);
							return strContent;
						} else if (this.plugin.settings.sttModel && this.plugin.settings.sttModel.toLowerCase().includes("google")) {
							const ext = fileName.split(".").pop()?.toLowerCase();
							const encoding = this.getEncodingFromExtension(ext);
							const { base64: audioBase64 } = await this.readFileAsBase64(audioFilePath);
							const transcript = await this.callGoogleTranscription(audioBase64, encoding as string);
							return transcript || "";
						} else {
							const blob = file.slice(0, file.size, file.type);
							const { body: finalBody, contentType } = await this.buildMultipartFormData(blob, fileName, file.type);
							const data = await this.callWhisperTranscription(finalBody, contentType);
							// response.text().then((text) => {
							// 	SummarDebug.log(3, `Response sendAudioData: ${text}`);
							// });

							// 응답 확인
							if (!data.segments || data.segments.length === 0) {
								SummarDebug.log(1, `No transcription segments received for file: ${fileName}`);
								if (data.text && data.text.length > 0) {
									return data.text;
								} else {
									SummarDebug.log(1, `No transcription text received for file: ${fileName}`);
									return "";
								}
							}
							SummarDebug.log(3, data);
							// SRT 포맷 변환
							const srtContent = data.segments
								.map((segment: any, index: number) => {
									const start = formatTime(segment.start + seconds);
									const end = formatTime(segment.end + seconds);
									const text = segment.text.trim();

									// return `${index + 1}\n${start} --> ${end}\n${text}\n`;
									return `${start} --> ${end}\n${text}\n`;
								})
								.join("");

							return srtContent;
						}
					} catch (error: any) {
						lastError = error;
						// 503 에러만 재시도, 그 외는 바로 break
						if (error && (error.status === 503 || (error.message && error.message.includes("503")))) {
							SummarDebug.error(1, `503 error on attempt ${attempt} for file ${fileName}, retrying...`, error);
							if (attempt < 3) await new Promise(res => setTimeout(res, 1000 * attempt));
							continue;
						} else {
							SummarDebug.error(1, `Error processing file ${fileName}:`, error);
							break;
						}
					}
				}
				SummarDebug.error(1, `Failed to transcribe file ${fileName} after 3 attempts. Last error:`, lastError);
				this.timer.stop();
				return { __isTranscribeError: true, error: lastError };
			}
			// 실제 호출
			return await transcribeWithRetry.call(this);
		});

		// Wait for all transcriptions to complete
		const transcriptions = await runWithConcurrencyLimit(transcriptionTasks, MAX_CONCURRENT);

        // 실패 파일 정보 수집
        const failedFiles: { name: string, error: any }[] = [];
        audioSortedFiles.forEach((file, idx) => {
            const t = transcriptions[idx];
            const isEmpty = (typeof t === 'string') ? t.trim() === "" : !t;
            if (!t || isEmpty) {
                if (typeof t === 'object' && t !== null && t.__isTranscribeError) {
                    failedFiles.push({ name: file.name, error: t.error });
                } else {
                    failedFiles.push({ name: file.name, error: null });
                }
            }
        });

        if (failedFiles.length > 0) {
            this.timer.stop();
            let errorMsg = '\u274C Failed to transcribe some audio files. All files must be processed successfully to proceed.\n';
            errorMsg += failedFiles.map(f => {
                let errStr = f.error ? (f.error.status ? `[${f.error.status}] ` : '') + (f.error.message || f.error.toString?.() || f.error) : 'Unknown error';
                return `- ${f.name}: ${errStr}`;
            }).join('\n');
            this.updateResultText(errorMsg);
            throw new Error("One or more audio transcriptions failed. Aborting next steps.");
        }

        // Combine all transcriptions with filename headers
		transcriptedText = sortedFiles
			.filter(isAudioFile)
			.map((file, idx) => {
				const header = `----- [${file.name}] ------\n`;
				const t = transcriptions[idx];
				// string이 아니면 빈 문자열로 대체
				return header + (typeof t === "string" ? t : "");
			})
			.join("\n");

		const baseFilePath = normalizePath(`${noteFilePath}/${folderPath}`);

		const existingFile = this.plugin.app.vault.getAbstractFileByPath(`${baseFilePath} transcript.md`);
		let newFilePath = "";
		if (existingFile && existingFile instanceof TFile) {
			// If the file exists, find a new unique filename
			newFilePath = getAvailableFilePath(baseFilePath, " transcript.md", this.plugin);
			SummarDebug.log(1, `File already exists. Created new file: ${newFilePath}`);
		} else {
			// If the file does not exist, create it
			newFilePath = `${baseFilePath} transcript.md`;
			SummarDebug.log(1, `File created: ${newFilePath}`);
		}
		await this.plugin.app.vault.create(newFilePath, `${audioList}\n${transcriptedText}`);
		await this.plugin.app.workspace.openLinkText(
			normalizePath(newFilePath),
			"",
			true
		);
		this.timer.stop();
		return {transcriptedText, newFilePath};

		function formatTime(seconds: number): string {
			const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
			const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
			const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
			const milliseconds = Math.floor((seconds % 1) * 1000).toString().padStart(3, "0");
	
			return `${hours}:${minutes}:${secs}.${milliseconds}`;
		}

		// Helper function to calculate the common folder path
		function getCommonFolderPath(files: File[]): string {
			// Extract full paths (webkitRelativePath includes folder structure)
			const paths = files.map((file) => (file as any).webkitRelativePath || file.name);

			if (paths.length === 0) {
				return ""; // No files provided
			}

			// Split paths into components and find the common prefix
			const splitPaths = paths.map((path) => path.split("/"));
			const commonParts: string[] = [];

			for (let i = 0; i < splitPaths[0].length; i++) {
				const part = splitPaths[0][i];
				if (splitPaths.every((segments) => segments[i] === part)) {
					commonParts.push(part);
				} else {
					break;
				}
			}
			return commonParts.join("/");
		}

		function getEncodingFromExtension(ext?: string): string | null {
			switch (ext) {
			  case "webm": return "WEBM_OPUS";
			  case "mp3": return "MP3";
			  case "wav": return "LINEAR16";
			  case "ogg": return "OGG_OPUS";
			  case "m4a": return "MP4";
			  default: return null;
			}
		}

	}


	// Check if the file is an audio or webm file
	isAudioOrWebmFile(file: TFile): boolean {
		const audioExtensions = ["mp3", "wav", "flac", "m4a", "ogg", "webm"];
		const extension = file.extension?.toLowerCase();
		return audioExtensions.includes(extension);
	}

	// Check if the folder contains any audio or webm files
	folderContainsAudioOrWebm(folder: TFolder): boolean {
		const files = this.plugin.app.vault.getFiles();
		return files.some(
			(file) =>
				file.parent !== null && // Ensure file.parent is not null
				file.parent.path === folder.path &&
				this.isAudioOrWebmFile(file)
		);
	}

	mapLanguageToWhisperCode(lang: string): string {
		const map: Record<string, string> = {
		  // BCP-47 전체 코드 → Whisper 언어 코드
		  "ko-KR": "ko",
		  "ja-JP": "ja",
		  "en-US": "en",
		  "en-GB": "en",
		  "zh-CN": "zh",
		  "zh-TW": "zh",
		  "fr-FR": "fr",
		  "de-DE": "de",
		  "es-ES": "es",
		  "pt-PT": "pt",
		  "pt-BR": "pt",
		  "vi-VN": "vi", 
		  "th-TH": "th", 
		  
		  "ko": "ko",
		  "ja": "ja",
		  "en": "en",
		  "zh": "zh",
		  "fr": "fr",
		  "de": "de",
		  "es": "es",
		  "pt": "pt",
		  "vi": "vi",
		  "th": "th",
		};
	  
		const normalized = lang.trim().toLowerCase();
		return map[normalized] ?? "ko"; 
	}

	async buildMultipartFormData(blob: Blob, fileName: string, fileType: string): Promise<{ body: Blob, contentType: string }> {
		const encoder = new TextEncoder();
		const boundary = "----SummarFormBoundary" + Math.random().toString(16).slice(2);
		const CRLF = "\r\n";

		const bodyParts: (Uint8Array | Blob | string)[] = [];

		function addField(name: string, value: string) {
			bodyParts.push(
				encoder.encode(`--${boundary}${CRLF}`),
				encoder.encode(`Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}`),
				encoder.encode(`${value}${CRLF}`)
			);
		}

		function addFileField(name: string, filename: string, type: string, content: Uint8Array) {
			bodyParts.push(
				encoder.encode(`--${boundary}${CRLF}`),
				encoder.encode(`Content-Disposition: form-data; name="${name}"; filename="${filename}"${CRLF}`),
				encoder.encode(`Content-Type: ${type}${CRLF}${CRLF}`),
				content,
				encoder.encode(CRLF)
			);
		}

		const arrayBuffer = await blob.arrayBuffer();
		const binaryContent = new Uint8Array(arrayBuffer);

		addFileField("file", fileName, fileType, binaryContent);
		// addField("model", this.plugin.settings.sttModel || "whisper-1");
		addField("model", this.plugin.settings.sttModel || this.plugin.getDefaultModel("sttModel"));

		if (this.plugin.settings.recordingLanguage) {
			addField("language", this.mapLanguageToWhisperCode(this.plugin.settings.recordingLanguage));
		}

		addField("response_format", this.plugin.settings.sttModel === "whisper-1" ? "verbose_json" : "json");

		if ((this.plugin.settings.sttModel === "gpt-4o-mini-transcribe" || this.plugin.settings.sttModel === "gpt-4o-transcribe")
			&& this.plugin.settings.sttPrompt) {
			addField("prompt", this.plugin.settings.sttPrompt);
		}

		bodyParts.push(encoder.encode(`--${boundary}--${CRLF}`));

		return {
			body: new Blob(bodyParts, { type: `multipart/form-data; boundary=${boundary}` }),
			contentType: `multipart/form-data; boundary=${boundary}`
		};
	}

	async callWhisperTranscription(requestbody: Blob, contentType: string): Promise<any> {
        // 엔드포인트 설정 (비어있으면 기본값)
        const endpoint = this.plugin.settings.openaiApiEndpoint?.trim() || "https://api.openai.com";
        const url = `${endpoint.replace(/\/$/, "")}/v1/audio/transcriptions`;
        const response = await requestUrl({
            url: url,
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.plugin.settings.openaiApiKey}`,
                "Content-Type": contentType,
            },
            body: await requestbody.arrayBuffer(),
        });

        return response.json;
    }

	////////////////////////////
	async readFileAsBase64(filePath: string): Promise<{ base64:string; mimeType: string }> {
		const arrayBuffer = await this.plugin.app.vault.adapter.readBinary(filePath);
		const uint8Array = new Uint8Array(arrayBuffer);
		const mimeType = detectMimeType(uint8Array);

		let binary = '';
		uint8Array.forEach(byte => binary += String.fromCharCode(byte));
		return { base64: btoa(binary), mimeType };

		function detectMimeType(data: Uint8Array): string {
			// MIME type signatures for common audio formats
			const signatures: { [key: string]: string } = {
				'4944330': 'audio/mpeg',              // MP3 - ID3v2
				'fff': 'audio/mpeg',                 // MP3 - No ID3 or ID3v1
				'52494646': 'audio/wav',             // WAV - RIFF
				'4f676753': 'audio/ogg',             // OGG
				'667479704d3441': 'audio/m4a',       // M4A
				'1a45dfa3': 'audio/webm'            // WEBM
			};
			
			// convert first 12 bytes to hex
			let hex = '';
			for (let i = 0; i < Math.min(12, data.length); i++) {
				let h = data[i].toString(16);
				hex += h.length === 1 ? '0' + h : h;
			}
			
			// match signature
			for (const [signature, mime] of Object.entries(signatures)) {
				if (hex.startsWith(signature)) {
					return mime;
				}
			}
			
			// default MIME type
			return 'application/octet-stream';
		}
	}

	GoogleApiKeyAlert() {
		const fragment = document.createDocumentFragment();
		// const message1 = document.createElement("span");
		// message1.textContent = "To publish your notes to Confluence, " +
		// 	"please specify the Parent Page where the content will be saved. \n";
		// fragment.appendChild(message1);

		// 링크 생성 및 스타일링
		const link = document.createElement("a");
		link.textContent = "Google API key is missing. Please add your API key in the settings.";
		link.href = "#";
		link.style.cursor = "pointer";
		link.style.color = "var(--text-accent)"; // 링크 색상 설정 (옵션)
		link.addEventListener("click", (event) => {
			event.preventDefault(); // 기본 동작 방지
			showSettingsTab(this.plugin, 'common-tab');
		});
		fragment.appendChild(link);
		SummarDebug.Notice(0, fragment, 0);
		
		// SummarDebug.Notice(0, "Please set Confluence Parent Page URL, Space Key, and ID in the settings.",0);
		return;	
	}

	async callGoogleTranscription(audioBase64: string, encoding: string): Promise<string | null> {
		const apiKey = this.plugin.settings.googleApiKey;
		if (!apiKey || apiKey.length === 0) {
		  SummarDebug.Notice(1, "Google API key is missing. Please add your API key in the settings.");
		  this.GoogleApiKeyAlert();
		  return null;
		}
	
		const request: RequestUrlParam = {	
		  url: `https://speech.googleapis.com/v1/speech:recognize?key=${this.plugin.settings.googleApiKey}`,
		  method: "POST",
		  headers: {
			"Content-Type": "application/json",
		  },
		  body: JSON.stringify({
			config: {
			  encoding: encoding,
			//   sampleRateHertz: 16000,
			  languageCode: "ko-KR",
			},
			audio: {
			  content: audioBase64,
			},
		  }),
		};
	
		try {
		  const response = await SummarRequestUrl(this.plugin, request);
		  const results = response.json.results;
		  if (results && results.length > 0) {
			SummarDebug.log(1, `Google Speech-to-Text API response: ${JSON.stringify(results)}`);
			return results.map((r: any) => r.alternatives[0].transcript).join("\n");
		  } else {
			const errorMessage = response.json.error?.message || "Unknown error";
			if (errorMessage) {
				SummarDebug.Notice(1, `Google Speech-to-Text API error: ${errorMessage}`);
				throw new Error(`Google Speech-to-Text API error: ${errorMessage}`);
			} else {
				SummarDebug.Notice(1, "No transcription results found.");	
			}
			return "";
		  }
		} catch (error) {
		  SummarDebug.Notice(1, "Error calling Google Speech-to-Text API:", error);
		  return null;
		}
	}
	
	async callGeminiTranscription(base64: string, mimeType: string): Promise<string | null> {
		const apiKey = this.plugin.settings.googleApiKey;
		if (!apiKey || apiKey.length === 0) {
		  SummarDebug.Notice(1, "Google API key is missing. Please add your API key in the settings.");
		  this.GoogleApiKeyAlert();
		  return null;
		}

		const sttModel = this.plugin.settings.sttModel;
		const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${sttModel}:generateContent`;
		let systemInstruction = `You are an expert in audio-to-text transcription.\n\n1. Accurately transcribe the provided audio content into text.\n2. You MUST output the transcription in SRT (SubRip Text) format only.\n3. Split each subtitle entry into segments of 2-3 seconds.\n4. Follow this strict SRT format for every output:\n   - ommit Sequential number\n   - Start time --> End time (in 00:00:00.000 --> 00:00:00.000 format)\n   - Text content\n   - Blank line (to separate from next entry)\n\n5. Include appropriate punctuation and paragraphing according to the language's grammar and context.\n6. Indicate non-verbal sounds, music, or sound effects in brackets, such as [noise], [music], [applause], etc.\n7. If multiple speakers are present, clearly indicate speaker changes (e.g., "Speaker 1: Hello").\n\nYour response must contain ONLY the SRT format transcript with no additional explanation or text.`;
		if (this.plugin.settings.recordingLanguage) {
			systemInstruction += ` The input language is ${this.mapLanguageToWhisperCode(this.plugin.settings.recordingLanguage)}.`;
		}
		try {
			const response = await SummarRequestUrl(this.plugin, {
				url: `${API_URL}?key=${this.plugin.settings.googleApiKey}`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					contents: [{
						parts: [
							{ text: systemInstruction },
							{
								inlineData: {
									mimeType: mimeType,
									data: base64
								}
							}
						]
					}],
				})
			});
			if (response.status !== 200) {
				throw new Error(`API 오류 (${response.status}): ${response.text}`);
			}
			const data = response.json;
			if (data.candidates && data.candidates.length > 0 && 
				data.candidates[0].content && 
				data.candidates[0].content.parts && 
				data.candidates[0].content.parts.length > 0) {
				const result = data.candidates[0].content.parts[0].text;
				if (typeof result === 'string') {
					return result;
				} else {
					throw new Error('Gemini API returned non-string result');
				}
			} else {
				throw new Error('candidates not found in the response');
			}
		} catch (error) {
			SummarDebug.error(1, "Error calling Gemini API:", error);
			throw new Error(`Error calling gemini api: ${error.message}`);
		}
	}



	adjustSrtTimestamps(srtContent: string, secondsToAdd: number): string {
		// timestamp format: 00:00:00,000 --> 00:00:00,000
		const timestampRegex = /(\d{2}):(\d{2}):(\d{2}).(\d{3}) --> (\d{2}):(\d{2}):(\d{2}).(\d{3})/g;
		
	    let adjustedContent = srtContent.replace(
			/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/g, 
			(match, startHour, startMin, startSec, startMs, endHour, endMin, endSec, endMs) => {
				// 시작 시간에 초 추가
				const startTime = new Date(0);
				startTime.setHours(parseInt(startHour, 10));
				startTime.setMinutes(parseInt(startMin, 10));
				startTime.setSeconds(parseInt(startSec, 10) + secondsToAdd); // 초 추가
				startTime.setMilliseconds(parseInt(startMs, 10));
				
				// 종료 시간에 초 추가
				const endTime = new Date(0);
				endTime.setHours(parseInt(endHour, 10));
				endTime.setMinutes(parseInt(endMin, 10));
				endTime.setSeconds(parseInt(endSec, 10) + secondsToAdd); // 초 추가
				endTime.setMilliseconds(parseInt(endMs, 10));
				
				// 새 타임스탬프 형식으로 변환 (원래 형식과 동일하게 HH:MM:SS.mmm)
				const newStartTime = `${padZero(startTime.getHours())}:${padZero(startTime.getMinutes())}:${padZero(startTime.getSeconds())}.${padZeroMs(startTime.getMilliseconds())}`;
				const newEndTime = `${padZero(endTime.getHours())}:${padZero(endTime.getMinutes())}:${padZero(endTime.getSeconds())}.${padZeroMs(endTime.getMilliseconds())}`;
				
				return `${newStartTime} --> ${newEndTime}`;
			}
		);
		adjustedContent = adjustedContent.replace(
			/(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2})\.(\d{3})/g,
			(match, startMin, startSec, startMs, endMin, endSec, endMs) => {
				// 시작 시간에 초 추가
				const startTime = new Date(0);
				startTime.setHours(0); // 시간은 0으로 설정
				startTime.setMinutes(parseInt(startMin, 10));
				startTime.setSeconds(parseInt(startSec, 10) + secondsToAdd); // 초 추가
				startTime.setMilliseconds(parseInt(startMs, 10));
				
				// 종료 시간에 초 추가
				const endTime = new Date(0);
				endTime.setHours(0); // 시간은 0으로 설정
				endTime.setMinutes(parseInt(endMin, 10));
				endTime.setSeconds(parseInt(endSec, 10) + secondsToAdd); // 초 추가
				endTime.setMilliseconds(parseInt(endMs, 10));
				
				// 시간 값에 따라 출력 형식 결정
				// 60분 이상으로 변경된 경우 HH:MM:SS.mmm 형식으로 변환
				const newStartTime = `${padZero(startTime.getHours())}:${padZero(startTime.getMinutes())}:${padZero(startTime.getSeconds())}.${padZeroMs(startTime.getMilliseconds())}`;
				const newEndTime = `${padZero(endTime.getHours())}:${padZero(endTime.getMinutes())}:${padZero(endTime.getSeconds())}.${padZeroMs(endTime.getMilliseconds())}`;

				return `${newStartTime} --> ${newEndTime}`;
			}
		);
		return adjustedContent;
		
		/**
		 * Fill hours, minutes, and seconds with a two-digit string (e.g. 5 -> "05")
		 */
		function padZero(num: number): string {
			return num.toString().padStart(2, '0');
		}
		
		/**
		 * Fill milliseconds with a three-digit string (e.g. 5 -> "005")
		 */
		function padZeroMs(num: number): string {
			return num.toString().padStart(3, '0');
		}

	}

}

// 오디오 파일 여부를 판별하는 유틸 함수 (File, TFile 모두 지원)
function isAudioFile(file: { name: string, type?: string }): boolean {
    const audioExtensions = ["mp3", "wav", "ogg", "m4a", "webm"];
    if (file.type && file.type.startsWith("audio/")) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ext ? audioExtensions.includes(ext) : false;
}
