import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug, containsDomain, SummarRequestUrl } from "./globals";
import { SummarAI } from "./summarai";
import { ConfluenceAPI } from "./confluenceapi";

export class ConfluenceHandler extends SummarViewContainer {

	constructor(plugin: SummarPlugin) {
		super(plugin);
	}


	/*
	 * fetchAndSummarize 함수는 URL을 가져와서 요약을 생성합니다.
	 * @param outputContainer 결과를 표시할 textarea 엘리먼트
	 * @param url 가져올 URL
	 * @param plugin 플러그인 인스턴스
	 */
	async fetchAndSummarize(url: string) {
		const confluenceApiToken = this.plugin.settingsv2.common.confluenceApiToken;
		const confluenceDomain = this.plugin.settingsv2.common.confluenceDomain;
		const useConfluenceAPI = this.plugin.settingsv2.common.useConfluenceAPI;
		const webPrompt = this.plugin.settingsv2.web.webPrompt;

		this.initOutputRecord("web");

		const summarai = new SummarAI(this.plugin, this.plugin.settingsv2.web.webModel, 'web');
		if (!summarai.hasKey(true, this.outputRecord.key, this.outputRecord.label as string)) return;			

		if (!confluenceApiToken) {
			SummarDebug.Notice(0, "If you want to use the Confluence API, please configure the API token in the plugin settings.", 0);
		}

		this.updateOutputText("Fetching and summarizing...");

		try {
			this.startTimer();

			// extractConfluenceInfo 함수 호출
			const { confluenceApiToken } = this.plugin.settingsv2.common;

			const conflueceapi = new ConfluenceAPI(this.plugin);
			let pageId = "";
			let page_content: string = "";

			if (confluenceApiToken && confluenceDomain && containsDomain(url, this.plugin.settingsv2.common.confluenceDomain)) {
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
			this.updateOutputText("Fedtched page content");
			SummarDebug.log(2, "Fetched page content:", page_content);


			this.updateOutputText(`Generating summary using [${this.plugin.settingsv2.web.webModel}]...` );

			const message = `${webPrompt}\n\n${page_content}`;
			
			this.pushOutputPrompt(message);

			await summarai.complete([{role:'user', text:message}]);
			const status = summarai.response.status;
			const summary = summarai.response.text;

			this.stopTimer();

			if (status !== 200) {
				SummarDebug.error(1, "OpenAI API Error:", summary);
				this.updateOutputText(`Error: ${status} - ${summary}`);
				return;
			}

			if (summary && summary.length > 0) {
				this.updateOutputText(summary, true);
				this.setNewNoteName();
			} else {
				this.updateOutputText("No valid response from OpenAI API.");
			}

		} catch (error) {
			this.stopTimer();
			SummarDebug.error(1, "Error:", error);
			let msg = "An error occurred while processing the request.";
			if (error) {
				msg += ` | ${error?.status || ''} ${error?.message || error?.toString?.() || error}`;
			}
			this.updateOutputText(msg);
		}
	}

}