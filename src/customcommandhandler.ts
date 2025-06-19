import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug } from "./globals";
import { SummarAI } from "./summarai";
import { SummarTimer } from "./summartimer";
import { MarkdownView } from "obsidian";
import { text } from "stream/consumers";


export class CustomCommandHandler extends SummarViewContainer {
	private timer: SummarTimer;

	constructor(plugin: SummarPlugin) {
		super(plugin);
		this.timer = new SummarTimer(plugin);
	}

	/*
	 * fetchAndSummarize 함수는 URL을 가져와서 요약을 생성합니다.
	 * @param resultContainer 결과를 표시할 textarea 엘리먼트
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

		const settings = this.plugin.settings;
		const cmdModel = settings[`cmd_model_${cmdIndex}`] || 'gpt-4o';
		const cmdPrompt = settings[`cmd_prompt_${cmdIndex}`] || '';
		const appendToNote = !!settings[`cmd_append_to_note_${cmdIndex}`];
		const copyToClipboard = !!settings[`cmd_copy_to_clipboard_${cmdIndex}`];

		const summarai = new SummarAI(this.plugin, cmdModel as string);

		if (!summarai.hasKey(true)) return;

		this.updateResultText(`Execute prompt with selected text using [${cmdModel}]...`);
		this.enableNewNote(false);

		try {
			this.timer.start();

			const message = `${cmdPrompt}\n\n${selectedText}`;

			await summarai.chat([message]);
			const responseStatus = summarai.response.status;
			const responseText = summarai.response.text;
			this.timer.stop();

			if (responseStatus !== 200) {
				const errorText = responseText || "Unknown error occurred.";
				SummarDebug.error(1, "AI API Error:", errorText);
				this.updateResultText(`Error: ${responseStatus} - ${errorText}`);
				this.enableNewNote(false);

				return;
			}

			if (responseText && responseText.length > 0) {
				this.updateResultText(responseText);
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
				this.updateResultText("No valid response from OpenAI API.");
				this.enableNewNote(false);
			}

		} catch (error) {
			this.timer.stop();
			SummarDebug.error(1, "Error:", error);
			let msg = "An error occurred while processing the request.";
			if (error) {
				msg += ` | ${error?.status || ''} ${error?.message || error?.toString?.() || error}`;
			}
			this.updateResultText(msg);
			this.enableNewNote(false);
		}
	}

}