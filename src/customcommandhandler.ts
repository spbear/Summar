import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug } from "./globals";
import { SummarAI } from "./summarai";
import { MarkdownView } from "obsidian";
import { text } from "stream/consumers";


export class CustomCommandHandler extends SummarViewContainer {

	constructor(plugin: SummarPlugin) {
		super(plugin);
	}

	/*
	 * fetchAndSummarize 함수는 URL을 가져와서 요약을 생성합니다.
	 * @param outputContainer 결과를 표시할 textarea 엘리먼트
	 * @param url 가져올 URL
	 * @param plugin 플러그인 인스턴스
	 */
	async executePrompt(selectedText: string, cmdId: string) {
		// cmdId에서 인덱스 추출 (예: custom-command-3 → 3)
		const match = cmdId.match(/custom-command-(\d+)/);
		const cmdIndex = match ? parseInt(match[1], 10) : undefined;
		if (!cmdIndex) {
			SummarDebug.error(1, `Invalid cmdId: ${cmdId}`);
			return;
		}

		// V2 설정에서 커맨드 정보 가져오기
		const command = this.plugin.settingsv2.custom.command[cmdIndex - 1]; // 0-based index
		if (!command) {
			SummarDebug.error(1, `Command not found at index: ${cmdIndex - 1}`);
			return;
		}

		
		const cmdModel = command.model || 'gpt-4o';
		const cmdPrompt = command.prompt || '';
		const appendToNote = command.appendToNote;
		const copyToClipboard = command.copyToClipboard;

		this.initOutputRecord("custom");

		const summarai = new SummarAI(this.plugin, cmdModel as string, 'custom');

		if (!summarai.hasKey(true, this.outputRecord.key, this.outputRecord.label as string)) return;			


		this.updateOutputText(`Execute prompt with selected text using [${cmdModel}]...`);
		// this.enableNewNote(false, outputKey);

		try {
			this.startTimer();

			const message = `${cmdPrompt}\n\n${selectedText}`;
			this.pushOutputPrompt(message);

			await summarai.complete([message]);
			const responseStatus = summarai.response.status;
			const responseText = summarai.response.text;
			this.stopTimer();

			if (responseStatus !== 200) {
				const errorText = responseText || "Unknown error occurred.";
				SummarDebug.error(1, "AI API Error:", errorText);
				this.updateOutputText(`Error: ${responseStatus} - ${errorText}`);
				// this.enableNewNote(false, outputKey);

				return;
			}

			if (responseText && responseText.length > 0) {
				this.updateOutputText(responseText);
				this.enableNewNote(true);

				// 결과를 노트에 append (설정에 따라)
				if (appendToNote) {
					const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
					const editor = view && (view as MarkdownView).editor;
					if (editor) {
						let insertLine = editor.getCursor().line + 1;
						let insertCh = 0;
						// 멀티라인 선택 시 마지막 선택 줄의 다음 줄에 삽입
						const sel = editor.listSelections && editor.listSelections()[0];
						if (sel && sel.anchor && sel.head) {
							const from = sel.anchor.line < sel.head.line ? sel.anchor : sel.head;
							const to = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
							insertLine = Math.max(from.line, to.line) + 1;
							insertCh = 0;
						}
						// 커서가 문서의 마지막 줄 끝에 있으면 먼저 줄 추가 후 다음 줄에 결과 삽입
						const cursor = editor.getCursor();
						const lastLine = editor.lastLine();
						const lastLineLen = editor.getLine(lastLine).length;
						if (cursor.line === lastLine && cursor.ch === lastLineLen) {
							editor.replaceRange("\n", { line: lastLine, ch: lastLineLen });
							insertLine = lastLine + 1;
							insertCh = 0;
						}
						// 결과 삽입
						editor.replaceRange(responseText + "\n", { line: insertLine, ch: insertCh });
						// selection 해제 및 커서 이동 (결과의 첫 위치)
						editor.setSelection({ line: insertLine, ch: 0 }, { line: insertLine, ch: 0 });
					}
				}

				// 결과를 클립보드에 복사 (설정에 따라)
				if (copyToClipboard) {
					try {
						await navigator.clipboard.writeText(responseText);
						SummarDebug.Notice(1, "Results copied to clipboard.");
					} catch (err) {
						SummarDebug.error(1, "Failed to copy to clipboard:", err);
					}
				}
			} else {
				this.updateOutputText("No valid response from OpenAI API.");
				// this.enableNewNote(false, outputKey);
			}

		} catch (error) {
			this.stopTimer();
			SummarDebug.error(1, "Error:", error);
			let msg = "An error occurred while processing the request.";
			if (error) {
				msg += ` | ${error?.status || ''} ${error?.message || error?.toString?.() || error}`;
			}
			this.updateOutputText(msg);
			// this.enableNewNote(false, outputKey);
		}
	}

}