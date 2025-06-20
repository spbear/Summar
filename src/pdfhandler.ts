import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug } from "./globals";
import { SummarAI } from "./summarai";
import { SummarTimer } from "./summartimer";
import { PdfToPng } from "./pdftopng";
import { JsonBuilder } from "./jsonbuilder";


export class PdfHandler extends SummarViewContainer {
	private timer: SummarTimer;

	constructor(plugin: SummarPlugin) {
		super(plugin);
		this.timer = new SummarTimer(plugin);
	}

	/*
	 * convertPdfToMarkdown 함수는 PDF를 이미지로 변환한 후 마크다운으로 변환합니다.
	 * @param resultContainer 결과를 표시할 textarea 엘리먼트
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
		const summarai = new SummarAI(this.plugin, this.plugin.settings.pdfModel, 'pdf');
		if (!summarai.hasKey(true)) return;

		const pdftopng = new PdfToPng(this.plugin);
		try {
			if (!(await pdftopng.isPopplerInstalled())) {
				SummarDebug.Notice(0, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.", 0);
				this.updateResultText("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
				this.enableNewNote(false);
				throw new Error("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
			}

			const pdfPrompt = this.plugin.settings.pdfPrompt;
			SummarDebug.Notice(1, file.name);

			this.timer.start();

			const base64Values = await pdftopng.convert(file, (SummarDebug.level() < 4));

			this.updateResultText(`Converting PDF to markdown using [${this.plugin.settings.pdfModel}]. This may take a while...`);
			this.enableNewNote(false);

			// JsonBuilder 인스턴스 생성
			const jsonBuilder = new JsonBuilder();

			// 기본 데이터 추가
			jsonBuilder.addData("model", this.plugin.settings.pdfModel);

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

			base64Values.forEach((base64, index) => {
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
			});

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

			await summarai.chatWithBody(body_content);
			const status = summarai.response.status;
			const summary = summarai.response.text;

			this.timer.stop();

			if (status !== 200) {
				SummarDebug.error(1, `OpenAI API Error: ${status} - ${summary}`);
				this.updateResultText(`Error: ${status} - ${summary}`);
				this.enableNewNote(false);
				return;
			}

			if (summary && summary.length > 0) {
				const markdownContent = this.extractMarkdownContent(summary);
				if (markdownContent) {
					this.updateResultText(markdownContent);
					this.enableNewNote(true);
				} else {
					this.updateResultText(summary);
					this.enableNewNote(true);
				}
			} else {
				this.updateResultText("No valid response from AI API.");
				this.enableNewNote(false);
			}

			SummarDebug.log(1, "PDF conversion to images complete.");
		
		} catch (error) {
			this.timer.stop();

			SummarDebug.error(1, "Error during PDF to PNG conversion:", error);
			this.updateResultText(`Error during PDF to PNG conversion: ${error}`);
			this.enableNewNote(false);
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
	
}