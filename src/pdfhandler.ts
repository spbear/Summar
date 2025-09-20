import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug, sanitizeFileName } from "./globals";
import { SummarAI } from "./summarai";
import { PdfToPng } from "./pdftopng";
import { JsonBuilder } from "./jsonbuilder";
import { normalizePath } from "obsidian";


export class PdfHandler extends SummarViewContainer {

	constructor(plugin: SummarPlugin) {
		super(plugin);
	}

	/*
	 * convertPdfToMarkdown 함수는 PDF를 이미지로 변환한 후 마크다운으로 변환합니다.
	 * @param outputContainer 결과를 표시할 textarea 엘리먼트
	 * @param plugin 플러그인 인스턴스
	 */
	async convertPdfToMarkdown() {
		const fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.accept = ".pdf";
		fileInput.onchange = async () => {
			if (fileInput.files && fileInput.files.length > 0) {
				const file = fileInput.files[0];
				await this.convertToMarkdownFromPdf(file);
			}
		};
		fileInput.click();
	}

	async convertToMarkdownFromPdf(file: any): Promise<void> {
		this.initOutputRecord("pdf", false);

		const summarai = new SummarAI(this.plugin, this.plugin.settingsv2.pdf.pdfModel, 'pdf');
		if (!summarai.hasKey(true, this.outputRecord.key, this.outputRecord.label as string)) return;
		// if (!summarai.hasKey(true, outputKey, label)) return;

		const pdftopng = new PdfToPng(this.plugin);

		try {
			if (!(await pdftopng.isPopplerInstalled())) {
				SummarDebug.Notice(0, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.", 0);
				this.updateOutputText("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
				throw new Error("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
			}

			const pdfPrompt = this.plugin.settingsv2.pdf.pdfPrompt;
			const modelName = this.plugin.settingsv2.pdf.pdfModel;
			SummarDebug.Notice(1, file.name);

			this.pushOutputPrompt(pdfPrompt);
			this.startTimer();

			// 단계 1: PDF 파일 준비
			this.updateOutputText(`[10%] Preparing PDF file... (${file.name})`);

			// 단계 2: 이미지 변환
			this.updateOutputText(`[15%] Converting to images... Will use [${modelName}]`);
			// const base64Values = await pdftopng.convert(file, outputKey, label, (SummarDebug.level() < 4));
			const base64Values = await pdftopng.convert(file, this.outputRecord.key, this.outputRecord.label as string, (SummarDebug.level() < 4));
			const pageCount = base64Values.length;

			this.updateOutputText(`[30%] Image conversion completed (${pageCount} pages detected)`);

			// JsonBuilder 인스턴스 생성
			const jsonBuilder = new JsonBuilder();

			// 기본 데이터 추가
			jsonBuilder.addData("model", modelName);

			// 시스템 메시지 추가
			jsonBuilder.addToArray("messages", {
				role: "system",
				content: [
					{
						type: "text",
						text: pdfPrompt,
					},
				],
			});

			// 단계 3: 페이지별 메시지 준비
			for (let index = 0; index < base64Values.length; index++) {
				const base64 = base64Values[index];
				const progress = 30 + Math.floor((index + 1) / pageCount * 25); // 30% ~ 55%
				
				this.updateOutputText(`[${progress}%] Preparing message for page ${index + 1}/${pageCount}...`);
				
				SummarDebug.log(2, `${index + 1}번 파일의 Base64: ${base64}`);
				const page_prompt = `다음은 PDF의 페이지 ${index + 1}입니다.`;
				jsonBuilder.addToArray("messages", {
					role: "user",
					content: [
						{
							type: "text",
							text: page_prompt,
						},
						{
							type: "image_url",
							image_url: {
								url: `data:image/png;base64,${base64}`,
							},
						},
					],
				});
			}

			this.updateOutputText(`[55%] AI request preparation completed`);

			jsonBuilder.addToArray("messages", {
				role: "user",
				content: [
					{
						type: "text",
						text: "모든 페이지가 전송되었습니다. 이제 전체 PDF의 마크다운 결과를 출력하세요.",
					},
				],
			});

			const body_content = jsonBuilder.toString();
			SummarDebug.log(2, body_content);

			// 단계 4: AI 분석 시작
			const aiStartTime = Date.now();
			const estimatedTime = this.formatEstimatedTime(pageCount, modelName);
			this.updateOutputText(`[60%] AI analysis in progress... [${modelName}] (${pageCount} pages, ${estimatedTime})`);

			// AI 분석 중 진행 상태 업데이트를 위한 인터벌 설정
			const progressInterval = setInterval(() => {
				const elapsed = Math.floor((Date.now() - aiStartTime) / 1000);
				const [minTime, maxTime] = this.getEstimatedTimePerPage(modelName);
				const estimatedTotal = pageCount * maxTime; // 최대 예상 시간 기준
				
				// 60%에서 시작해서 85%까지 서서히 증가 (AI 분석 단계)
				let currentProgress = 60 + Math.min(25, Math.floor((elapsed / estimatedTotal) * 25));
				
				const progressTime = this.formatProgressTime(aiStartTime, pageCount, modelName);
				this.updateOutputText(`[${currentProgress}%] AI analysis in progress... [${modelName}] (${progressTime})`);
			}, 5000); // 5초마다 업데이트

			await summarai.completeWithBody(body_content);
			
			// 진행 상태 업데이트 중지
			clearInterval(progressInterval);
			
			const status = summarai.response.status;
			const summary = summarai.response.text;

			this.stopTimer();

			if (status !== 200) {
				SummarDebug.error(1, `OpenAI API Error: ${status} - ${summary}`);
				this.updateOutputText(`[ERROR] AI analysis failed: ${status} - ${summary}`);
				return;
			}

			// 단계 5: 결과 처리
			this.updateOutputText(`[90%] AI analysis completed, converting to markdown...`);

			if (summary && summary.length > 0) {
				const markdownContent = this.extractMarkdownContent(summary);
				if (markdownContent) {
					this.updateOutputText(`[95%] Creating new note...`);
					this.updateOutputText(`[100%] Markdown conversion completed! New note has been created.`);
					// PDF 파일명 기반으로 새 노트 자동 생성
					await this.createNewNoteFromPdf(file.name, markdownContent);
				} else {
					this.updateOutputText(`[95%] Creating new note...`);
					this.updateOutputText(`[100%] Conversion completed! New note has been created.`);
					// PDF 파일명 기반으로 새 노트 자동 생성
					await this.createNewNoteFromPdf(file.name, summary);
				}
			} else {
				this.updateOutputText("[ERROR] No valid response received from AI API.");
			}

			SummarDebug.log(1, "PDF conversion to images complete.");
		
		} catch (error) {
			this.stopTimer();

			SummarDebug.error(1, "Error during PDF to PNG conversion:", error);
			this.updateOutputText(`[ERROR] Error occurred during PDF conversion: ${error}`);
			SummarDebug.Notice(0, "Failed to convert PDF to PNG. Check console for details.");
		}
	}

	// 정규식을 사용하여 마크다운 내용만 추출
	extractMarkdownContent(fullText: string): string | null {
	  // 정규식 패턴
	  const markdownRegex = /```markdown\n([\s\S]*?)\n```/;
	
	  // 정규식 매칭
	  const match = fullText.match(markdownRegex);
	
	  // 매칭된 내용 반환 또는 null
	  return match ? match[1] : fullText;
	}

	/*
	 * PDF 파일명을 기반으로 새 Obsidian 노트를 생성합니다.
	 * @param fileName PDF 파일명
	 * @param content 마크다운 내용
	 */
	async createNewNoteFromPdf(fileName: string, content: string): Promise<void> {
		try {
			// PDF 파일명에서 확장자 제거하고 안전한 파일명으로 변환
			const baseFileName = sanitizeFileName(fileName.replace(/\.pdf$/i, ''));
			const now = new Date();
			const timestamp = now.getFullYear().toString().slice(2) +
				String(now.getMonth() + 1).padStart(2, "0") +
				now.getDate().toString().padStart(2, "0") + "-" +
				now.getHours().toString().padStart(2, "0") +
				now.getMinutes().toString().padStart(2, "0");
			
			// 고유한 파일명 생성
			const uniqueFileName = await this.generateUniqueFileName(`${baseFileName}_${timestamp}`, ".md");
			const filePath = normalizePath(uniqueFileName);
			
			// 새 노트 생성
			const createdFile = await this.plugin.app.vault.create(filePath, content);
			await this.plugin.app.workspace.openLinkText(filePath, "", true);
			this.updateOutputText(content,true);
			this.setNewNoteName(filePath);
			// this.foldOutput(true);

			SummarDebug.Notice(1, `Created new note: ${uniqueFileName}`, 3000);
		} catch (error) {
			SummarDebug.error(1, "Error creating new note:", error);
			SummarDebug.Notice(0, "Failed to create new note. Check console for details.", 5000);
		}
	}

	/*
	 * 중복되지 않는 고유한 파일명을 생성합니다.
	 * @param baseName 기본 파일명 (확장자 제외)
	 * @param extension 파일 확장자
	 * @returns 고유한 파일명
	 */
	async generateUniqueFileName(baseName: string, extension: string): Promise<string> {
		let fileName = `${baseName}${extension}`;
		let counter = 1;
		
		// 파일이 존재하는 동안 번호를 증가시키며 새로운 파일명 생성
		while (this.plugin.app.vault.getAbstractFileByPath(normalizePath(fileName))) {
			fileName = `${baseName} (${counter})${extension}`;
			counter++;
		}
		
		return fileName;
	}

	/*
	 * 모델별 페이지당 예상 처리 시간을 반환합니다 (초 단위)
	 * @param modelName 모델명
	 * @returns [최소시간, 최대시간]
	 */
	private getEstimatedTimePerPage(modelName: string): [number, number] {
		const lowerModel = modelName.toLowerCase();
		
		if (lowerModel.includes('gpt-4-vision') || lowerModel.includes('gpt-4v')) {
			return [8, 12]; // GPT-4 Vision: 느림
		} else if (lowerModel.includes('gpt-4o')) {
			return [5, 8];  // GPT-4o: 보통
		} else if (lowerModel.includes('claude')) {
			return [3, 6];  // Claude: 빠름
		} else if (lowerModel.includes('gemini')) {
			return [4, 7];  // Gemini: 보통
		} else {
			return [5, 10]; // 기본값
		}
	}

	/*
	 * 페이지 수와 모델에 따른 예상 시간 문자열을 생성합니다
	 * @param pageCount 페이지 수
	 * @param modelName 모델명
	 * @returns 예상 시간 문자열
	 */
	private formatEstimatedTime(pageCount: number, modelName: string): string {
		const [minTime, maxTime] = this.getEstimatedTimePerPage(modelName);
		const totalMax = pageCount * maxTime; // 최대 시간만 사용
		
		return `estimated ${totalMax}s`;
	}

	/*
	 * 경과 시간과 남은 예상 시간을 계산합니다
	 * @param startTime 시작 시간
	 * @param pageCount 총 페이지 수
	 * @param modelName 모델명
	 * @returns 진행 상태 문자열
	 */
	private formatProgressTime(startTime: number, pageCount: number, modelName: string): string {
		const elapsed = Math.floor((Date.now() - startTime) / 1000);
		const [minTime, maxTime] = this.getEstimatedTimePerPage(modelName);
		const totalMax = pageCount * maxTime; // 최대 시간 기준
		
		const remaining = Math.max(0, totalMax - elapsed);
		
		if (remaining <= 0) {
			return `${elapsed}s elapsed, completing soon`;
		} else {
			return `${elapsed}s elapsed, estimated ${remaining}s remaining`;
		}
	}
}