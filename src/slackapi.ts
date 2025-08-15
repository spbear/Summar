import { RequestUrlParam } from 'obsidian';
import { SummarRequestUrl, SummarDebug } from './globals';
import SummarPlugin from './main';

/**
 * Slack Canvas API 응답 타입 정의
 */
export interface SlackUploadResult {
    success: boolean;
    message: string;
    canvasUrl?: string | null;
}

interface SlackCanvasResponse {
    ok: boolean;
    canvas_id?: string;
    error?: string;
    detail?: string;
}

/**
 * Slack Canvas API 통합 클래스
 * Slack Canvas를 통해 노트 내용을 업로드하고 공유하는 기능을 제공합니다.
 */
export class SlackAPI {
    private plugin: SummarPlugin;

    constructor(plugin: SummarPlugin) {
        this.plugin = plugin;
    }

    /**
     * Slack API 기본 URL을 반환합니다. 사용자 정의 도메인이 설정된 경우 사용합니다.
     */
    private getSlackApiBaseUrl(): string {
        const customDomain = this.plugin.settingsv2.common.slackApiDomain;
        if (customDomain && customDomain.trim().length > 0) {
            // 사용자가 입력한 도메인에서 trailing slash 제거하고 https:// 추가
            const cleanDomain = customDomain.replace(/\/$/, '');
            return `https://${cleanDomain}/api`;
        }
        return "https://slack.com/api";
    }

    /**
     * 설정이 올바르게 구성되어 있는지 확인합니다.
     */
    public isConfigured(): boolean {
        const settings = this.plugin.settingsv2.common;
        return !!(settings.useSlackAPI);
    }

    /**
     * 설정 확인 및 에러 메시지를 반환합니다.
     */
    private validateConfiguration(): { isValid: boolean; message: string } {
        const settings = this.plugin.settingsv2.common;
        const isCanvasMode = this.plugin.SLACK_UPLOAD_TO_CANVAS;
        const uploadType = isCanvasMode ? "Canvas" : "메시지";
        
        if (!settings.useSlackAPI) {
            return {
                isValid: false,
                message: `Slack ${uploadType} 연동이 비활성화되어 있습니다. 설정에서 활성화해주세요.`
            };
        }

        // slackBotToken이 비어있어도 API 호출을 허용 (헤더에서 authorization 제외)
        return { isValid: true, message: "" };
    }

    /**
     * 입력값을 검증합니다.
     */
    private validateInputs(title: string, content: string): { isValid: boolean; message: string } {
        if (!title || title.trim().length === 0) {
            return {
                isValid: false,
                message: "노트 제목이 비어있습니다."
            };
        }

        if (!content || content.trim().length === 0) {
            return {
                isValid: false,
                message: "노트 내용이 비어있습니다."
            };
        }

        return { isValid: true, message: "" };
    }

    /**
     * 노트를 Slack에 업로드합니다 (Canvas 또는 메시지).
     */
    public async uploadNote(noteTitle: string, noteContent: string): Promise<SlackUploadResult> {
        try {
            const isCanvasMode = this.plugin.SLACK_UPLOAD_TO_CANVAS;
            const uploadType = isCanvasMode ? "Canvas" : "message";
            SummarDebug.log(1, `Starting Slack ${uploadType} upload for note: ${noteTitle}`);
            
            // 설정 검증
            const configValidation = this.validateConfiguration();
            if (!configValidation.isValid) {
                return {
                    success: false,
                    message: configValidation.message
                };
            }

            // 입력값 검증
            const inputValidation = this.validateInputs(noteTitle, noteContent);
            if (!inputValidation.isValid) {
                return {
                    success: false,
                    message: inputValidation.message
                };
            }

            let apiResponse: SlackUploadResult;
            
            if (isCanvasMode) {
                // Canvas 모드: Canvas 생성
                const processedContent = this.processContentForCanvas(noteContent);
                SummarDebug.log(2, `Processed content for Canvas: ${processedContent.length} characters`);
                apiResponse = await this.createCanvas(noteTitle, processedContent);
                
                if (apiResponse.success) {
                    SummarDebug.log(1, `Canvas upload successful: ${apiResponse.canvasUrl}`);
                } else {
                    SummarDebug.error(1, `Canvas upload failed: ${apiResponse.message}`);
                }
            } else {
                // 메시지 모드: 채널에 메시지 전송
                const channelId = this.plugin.settingsv2.common.slackChannelId;
                if (!channelId || channelId.trim().length === 0) {
                    return {
                        success: false,
                        message: "메시지 전송을 위해서는 Channel ID가 필요합니다. 설정에서 Channel ID를 입력해주세요."
                    };
                }
                
                SummarDebug.log(2, `Posting message to channel: ${channelId}`);
                const messageResult = await this.chatPostMessage(noteTitle, noteContent, channelId);
                
                // chatPostMessage 결과를 SlackUploadResult 형태로 변환
                apiResponse = {
                    success: messageResult.success,
                    message: messageResult.message,
                    canvasUrl: messageResult.messageUrl // messageUrl을 canvasUrl로 매핑
                };
                
                if (apiResponse.success) {
                    SummarDebug.log(1, `Message upload successful: ${messageResult.messageUrl}`);
                } else {
                    SummarDebug.error(1, `Message upload failed: ${apiResponse.message}`);
                }
            }
            
            return apiResponse;
            
        } catch (error) {
            const uploadType = this.plugin.SLACK_UPLOAD_TO_CANVAS ? "Canvas" : "message";
            SummarDebug.error(1, `Upload to Slack ${uploadType} failed:`, error);
            return {
                success: false,
                message: `Upload failed: ${error.message}`
            };
        }
    }    /**
     * Slack Canvas API를 통해 Canvas를 생성합니다.
     */
    private async createCanvas(title: string, markdown: string): Promise<SlackUploadResult> {
        const token = this.plugin.settingsv2.common.slackBotToken;
        const channelId = this.plugin.settingsv2.common.slackChannelId;

        // Canvas 생성 페이로드
        const canvasPayload: any = {
            title: title,
            document_content: {
                type: "markdown",
                markdown: markdown
            }
        };

        // 채널 ID가 설정되어 있으면 채널에 Canvas 탭을 추가
        if (channelId && channelId.trim().length > 0) {
            canvasPayload.channel_id = channelId;
        }

        // 헤더 구성 (token이 있을 때만 Authorization 헤더 추가)
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        if (token && token.trim().length > 0) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const request: RequestUrlParam = {
            url: `${this.getSlackApiBaseUrl()}/canvases.create`,
            method: "POST",
            headers: headers,
            body: JSON.stringify(canvasPayload),
            throw: false
        };

        try {
            const response = await SummarRequestUrl(this.plugin, request);
            SummarDebug.log(1, `Slack Canvas API Response Status: ${response.status}`);
            SummarDebug.log(2, `Slack Canvas API Response: ${JSON.stringify(response.json)}`);
            
            const apiResponse = response.json as SlackCanvasResponse;
            
            if (response.status === 200 && apiResponse.ok) {
                const canvasId = apiResponse.canvas_id;
                const workspaceDomain = this.plugin.settingsv2.common.slackWorkspaceUrl;
                const workspaceUrl = workspaceDomain ? `https://${workspaceDomain}` : "https://app.slack.com";
                
                let canvasUrl: string;
                if (channelId && channelId.trim().length > 0) {
                    // 채널 Canvas URL
                    canvasUrl = `${workspaceUrl}/client/${channelId}/canvas/${canvasId}`;
                } else {
                    // 개인 Canvas URL  
                    canvasUrl = `${workspaceUrl}/canvas/${canvasId}`;
                }
                
                return {
                    success: true,
                    message: channelId ? "Canvas가 채널에 성공적으로 생성되었습니다" : "개인 Canvas가 성공적으로 생성되었습니다",
                    canvasUrl: canvasUrl
                };
            } else {
                const errorMessage = apiResponse.error || "Unknown error";
                const errorDetail = apiResponse.detail || "";
                return {
                    success: false,
                    message: `Slack Canvas API 오류: ${errorMessage}${errorDetail ? ` - ${errorDetail}` : ''}`
                };
            }
        } catch (error) {
            SummarDebug.error(1, "Slack Canvas API request failed:", error);
            return {
                success: false,
                message: `요청 실패: ${error.message}`
            };
        }
    }

    /**
     * 콘텐츠를 Slack Canvas 마크다운에 적합하게 전처리합니다.
     */
    private processContentForCanvas(content: string): string {
        // Canvas는 표준 마크다운을 지원하므로 기본적인 정리만 수행
        let processed = content
            // Obsidian 특수 문법 제거 또는 변환
            .replace(/\[\[([^\]]+)\]\]/g, '$1') // 내부 링크를 일반 텍스트로
            .replace(/!\[\[([^\]]+)\]\]/g, '![Image]($1)') // 이미지 링크를 마크다운 이미지로
            .replace(/^---[\s\S]*?---/m, '') // frontmatter 제거
            .replace(/%%[\s\S]*?%%/g, '') // Obsidian 주석 제거
            .replace(/==([^=]+)==/g, '**$1**') // 하이라이트를 볼드로
            .replace(/\^([a-zA-Z0-9-]+)/g, '') // 블록 참조 제거
            .trim();

        // 연속된 줄바꿈 정리 (Canvas는 3개 이상의 줄바꿈을 잘 처리하지 못함)
        processed = processed.replace(/\n{3,}/g, '\n\n');

        // Canvas 마크다운 길이 제한 확인 (대략 50,000자 정도로 제한)
        if (processed.length > 45000) {
            processed = processed.substring(0, 45000) + "\n\n...\n\n*내용이 잘렸습니다. 전체 내용은 원본 노트를 참조하세요.*";
        }

        return processed;
    }

    /**
     * 사용자 멘션을 Canvas 형식으로 변환합니다.
     */
    private convertUserMention(userId: string): string {
        return `![](@${userId})`;
    }

    /**
     * 채널 멘션을 Canvas 형식으로 변환합니다.
     */
    private convertChannelMention(channelId: string): string {
        return `![](#${channelId})`;
    }

    /**
     * Slack 채널에 메시지를 전송합니다.
     */
    async chatPostMessage(title: string, markdown: string, channel_id: string): Promise<{ success: boolean; message: string; messageUrl?: string }> {
        const token = this.plugin.settingsv2.common.slackBotToken;
        
        // 마크다운을 Slack 메시지 블록으로 변환
        const messagePayload = {
            channel: channel_id,
            username: "Summar",
            icon_emoji: ":scroll:",
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: title
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: this.convertMarkdownToSlackMarkdown(markdown)
                    }
                }
            ]
        };

        // 헤더 구성 (token이 있을 때만 Authorization 헤더 추가)
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        if (token && token.trim().length > 0) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const request: RequestUrlParam = {
            url: `${this.getSlackApiBaseUrl()}/chat.postMessage`,
            method: "POST",
            headers: headers,
            body: JSON.stringify(messagePayload),
            throw: false
        };

        try {
            const response = await SummarRequestUrl(this.plugin, request);
            SummarDebug.log(1, `Slack chat.postMessage Response Status: ${response.status}`);
            SummarDebug.log(2, `Slack chat.postMessage Response: ${JSON.stringify(response.json)}`);
            
            if (response.status === 200 && response.json.ok) {
                const timestamp = response.json.ts;
                const channel = response.json.channel;
                const workspaceDomain = this.plugin.settingsv2.common.slackWorkspaceUrl;
                const workspaceUrl = workspaceDomain ? `https://${workspaceDomain}` : "https://app.slack.com";
                const messageUrl = `${workspaceUrl}/archives/${channel}/p${timestamp.replace('.', '')}`;
                
                return {
                    success: true,
                    message: "메시지가 Slack 채널에 성공적으로 전송되었습니다",
                    messageUrl: messageUrl
                };
            } else {
                const errorMessage = response.json.error || "Unknown error";
                return {
                    success: false,
                    message: `Slack API 오류: ${errorMessage}`
                };
            }
        } catch (error) {
            SummarDebug.error(1, "Slack chat.postMessage request failed:", error);
            return {
                success: false,
                message: `요청 실패: ${error.message}`
            };
        }
    }

    /**
     * 마크다운을 Slack mrkdwn 형식으로 변환합니다.
     */
    private convertMarkdownToSlackMarkdown(markdown: string): string {
        let converted = markdown
            // 이탤릭 처리 (*text* -> _text_)
            .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '_$1_')
            // 볼드 처리 (**text** -> *text*)
            .replace(/\*\*(.*?)\*\*/g, '*$1*')
            // 헤더를 볼드로 변환 (Slack에서는 # 문법 지원 안 함)
            .replace(/^### (.*$)/gim, '\n*$1*\n')
            .replace(/^## (.*$)/gim, '\n*$1*\n')
            .replace(/^# (.*$)/gim, '\n*$1*\n')
            // 인라인 코드 처리
            .replace(/`([^`\n]+)`/g, '`$1`')
            // 링크 처리
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
            // 리스트 아이템 처리 (들여쓰기 유지)
            .replace(/^(\s*)([-*+]) (.+$)/gim, '$1• $3')
            .replace(/^(\s*)(\d+)\. (.+$)/gim, '$1$2. $3')
            // Obsidian 특수 문법 제거
            .replace(/\[\[([^\]]+)\]\]/g, '$1') // 내부 링크를 일반 텍스트로
            .replace(/!\[\[([^\]]+)\]\]/g, '![Image]($1)') // 이미지 링크를 마크다운 이미지로
            .replace(/%%[\s\S]*?%%/g, '') // Obsidian 주석 제거
            .replace(/==([^=]+)==/g, '_*$1*_') // 하이라이트를 볼드+이탤릭으로
            .replace(/\^([a-zA-Z0-9-]+)/g, ''); // 블록 참조 제거

        // 코드 블록 처리
        converted = converted.replace(/```([^`]*(?:`[^`]*)*[^`]*)?```/g, (match, codeContent) => {
            return '```\n' + codeContent.trim() + '\n```';
        });

        // Slack 메시지 길이 제한 (약 3000자)
        if (converted.length > 2900) {
            converted = converted.substring(0, 2850) + "\n\n...\n_내용이 잘렸습니다. 전체 내용은 원본 노트를 참조하세요._";
        }

        // 연속된 줄바꿈 정리
        converted = converted.replace(/\n{3,}/g, '\n\n');

        return converted.trim();
    }

    /**
     * Bot 토큰이 유효한지 테스트합니다.
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        const token = this.plugin.settingsv2.common.slackBotToken;
        
        // 헤더 구성 (token이 있을 때만 Authorization 헤더 추가)
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        if (token && token.trim().length > 0) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const request: RequestUrlParam = {
            url: `${this.getSlackApiBaseUrl()}/auth.test`,
            method: "POST",
            headers: headers,
            throw: false
        };

        try {
            const response = await SummarRequestUrl(this.plugin, request);
            
            if (response.status === 200 && response.json.ok) {
                return {
                    success: true,
                    message: `연결 성공: ${response.json.team || 'Unknown Team'}`
                };
            } else {
                return {
                    success: false,
                    message: `연결 실패: ${response.json.error || 'Unknown error'}`
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `연결 오류: ${error.message}`
            };
        }
    }

    /**
     * 설정된 Slack 워크스페이스의 채널 목록을 가져옵니다.
     */
    async getChannels(): Promise<any[]> {
        const token = this.plugin.settingsv2.common.slackBotToken;
        
        // 헤더 구성 (token이 있을 때만 Authorization 헤더 추가)
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        if (token && token.trim().length > 0) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const request: RequestUrlParam = {
            url: `${this.getSlackApiBaseUrl()}/conversations.list?types=public_channel,private_channel`,
            method: "GET",
            headers: headers,
            throw: false
        };

        try {
            const response = await SummarRequestUrl(this.plugin, request);
            
            if (response.status === 200 && response.json.ok) {
                return response.json.channels || [];
            }
            return [];
        } catch (error) {
            SummarDebug.error(1, "Error fetching Slack channels:", error);
            return [];
        }
    }

    /**
     * 기존 Canvas 목록을 가져옵니다.
     */
    async getCanvases(): Promise<any[]> {
        const token = this.plugin.settingsv2.common.slackBotToken;
        
        // 헤더 구성 (token이 있을 때만 Authorization 헤더 추가)
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        if (token && token.trim().length > 0) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const request: RequestUrlParam = {
            url: `${this.getSlackApiBaseUrl()}/files.list?types=canvas`,
            method: "GET",
            headers: headers,
            throw: false
        };

        try {
            const response = await SummarRequestUrl(this.plugin, request);
            
            if (response.status === 200 && response.json.ok) {
                return response.json.files || [];
            }
            return [];
        } catch (error) {
            SummarDebug.error(1, "Error fetching Slack canvases:", error);
            return [];
        }
    }
}
