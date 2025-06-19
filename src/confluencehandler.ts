import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug, containsDomain, SummarRequestUrl, SummarAI } from "./globals";
import { SummarTimer } from "./summartimer";
import { ConfluenceAPI } from "./confluenceapi";

export class ConfluenceHandler extends SummarViewContainer {
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
	async fetchAndSummarize(url: string) {
		const { confluenceApiToken, confluenceDomain, useConfluenceAPI, webPrompt } = this.plugin.settings;

		const summarai = new SummarAI(this.plugin, this.plugin.settings.webModel);
		if (!summarai.hasKey(true)) return;

		if (!confluenceApiToken) {
			SummarDebug.Notice(0, "If you want to use the Confluence API, please configure the API token in the plugin settings.", 0);
		}

		this.updateResultText("Fetching and summarizing...");
		this.enableNewNote(false);

		try {
			this.timer.start();

			// extractConfluenceInfo 함수 호출
			const { confluenceApiToken } = this.plugin.settings;

			const conflueceapi = new ConfluenceAPI(this.plugin);
			let pageId = "";
			let page_content: string = "";

			if (confluenceApiToken && confluenceDomain && containsDomain(url, this.plugin.settings.confluenceDomain)) {
				const result = await conflueceapi.getPageId(url);

				SummarDebug.log(1, "Extracted Confluence Info:");
				SummarDebug.log(1, `Page ID: ${result.pageId}`);
				SummarDebug.log(1, `Space Key: ${result.spaceKey}`);
				SummarDebug.log(1, `Title: ${result.title}`);
				pageId = result.pageId as string;
			}
			if (pageId) {
				try {
					if (useConfluenceAPI && confluenceApiToken) {
						const { title, content } = await conflueceapi.getPageContent(pageId);
						page_content = await content;
						SummarDebug.log(2, `Fetched Confluence page content:\n ${content}`);
					} else {
						const response = await SummarRequestUrl(this.plugin, {
							url: url,
							method: "GET",
							headers: {
								Authorization: `Bearer ${confluenceApiToken}`,
							},
						});
						page_content = response.text;
					}
				} catch (error) {
					SummarDebug.error(1, "Failed to fetch page content:", error);
				}
			} else {
				const response = await SummarRequestUrl(this.plugin, {
					url: url,
					method: "GET",
				});
				page_content = response.text;
			}
			this.updateResultText("Fedtched page content");
			this.enableNewNote(false);

			SummarDebug.log(2, "Fetched page content:", page_content);


			this.updateResultText( `Generating summary using [${this.plugin.settings.webModel}]...` );
			this.enableNewNote(false);

			const message = `${webPrompt}\n\n${page_content}`;
			await summarai.chat([message]);
			const status = summarai.response.status;
			const summary = summarai.response.text;

			this.timer.stop();

			if (status !== 200) {
				SummarDebug.error(1, "OpenAI API Error:", summary);
				this.updateResultText(`Error: ${status} - ${summary}`);
				this.enableNewNote(false);

				return;
			}

			if (summary && summary.length > 0) {
				this.updateResultText(summary);
				this.enableNewNote(true);
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