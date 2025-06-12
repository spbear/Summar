import { Platform, normalizePath, FileSystemAdapter, Modal, App } from "obsidian";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { SummarDebug } from "./globals";
import { writeFileSync, unlinkSync } from "fs";
import SummarPlugin from "./main";

interface CalendarEvent {
    title: string;
    start: Date;
    end: Date;
    description?: string;
    location?: string;
    zoom_link?: string;
}

interface ZoomMeeting {
    title: string;
    start: string;
    end: string;
    description: string;
    location: string;
    zoom_link: string;
}

export class CalendarHandler {
    private intervalId: NodeJS.Timeout;
    private plugin: SummarPlugin;
    private events: CalendarEvent[] = [];
    autoRecord: boolean = false;
    eventContainer: HTMLElement;
    // private timers: { title: string; start: Date, timeoutId: NodeJS.Timeout }[] = [];
    private timers: Map<number, NodeJS.Timeout> = new Map();

    constructor(plugin: any) {
        this.plugin = plugin; // 플러그인 저장
        this.init();
    }

    private async init() {
        try {
            if (Platform.isMacOS && Platform.isDesktopApp) {
                // 초기 실행
                await this.updateScheduledMeetings();
                if (this.plugin.settings.autoLaunchZoomOnSchedule) {
                    this.plugin.reservedStatus.setStatusbarIcon("calendar-clock", "red");
                } else {
                    this.plugin.reservedStatus.setStatusbarIcon("calendar-x", "var(--text-muted)");
                }
                // this.plugin.reservedStatus.update(this.plugin.settings.autoLaunchZoomOnSchedule ? "⏰" : "", this.plugin.settings.autoLaunchZoomOnSchedule ? "green" : "black");

                // 10분마다 업데이트 실행
                this.intervalId = setInterval(() => {
                    this.updateScheduledMeetings();
                }, this.plugin.settings.calendar_polling_interval); // 10분 (600,000ms)
            }
        } catch (error) {
            SummarDebug.error(1, "Error initializing CalendarHandler:", error);
        }
    }
    
    // ✅ 클래스 종료 시 `setInterval` 해제
    public stop() {
        clearInterval(this.intervalId);
        SummarDebug.log(1, "Stopped CalendarHandler updates.");
    }

    /**
     * Checks if Xcode is installed and available on the system.
     * Returns true if installed, false otherwise.
     */
    async checkXcodeInstalled(): Promise<boolean> {
        return new Promise((resolve) => {
            const { exec } = require("child_process");
            exec("xcode-select -p", (error: Error | null, stdout: string, stderr: string) => {
                if (error || !stdout || stdout.trim() === "") {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async fetchZoomMeetings(): Promise<ZoomMeeting[]> {
        // Check if Xcode is installed
        const xcodeInstalled = await this.checkXcodeInstalled();
        if (!xcodeInstalled) {
            SummarDebug.Notice(0, `Xcode is not installed or not properly configured.\n\nCalendar integration via Swift requires Xcode.\n\nHow to install:\n1. Install Xcode from the App Store.\n2. After installation, run the following commands in Terminal:\n\n  sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer\n  sudo xcodebuild -runFirstLaunch\n\nRestart Obsidian after installation.`);
            throw new Error("Xcode is not installed or not configured.");
        }

        return new Promise((resolve, reject) => {
            // calendar_count가 없거나 0이면 실행하지 않음
            if (!this.plugin.settings.calendar_count || this.plugin.settings.calendar_count === 0) {
                SummarDebug.log(1, "캘린더가 설정되지 않아 fetchZoomMeetings를 실행하지 않습니다.");
                resolve([]);
                return;
            }

            // Build argument list for Swift
            const args: string[] = [];
            if (this.plugin.settings.calendar_fetchdays && Number.isInteger(this.plugin.settings.calendar_fetchdays)) {
                args.push(`--fetch-days=${this.plugin.settings.calendar_fetchdays}`);
            }
            // 캘린더가 하나도 없으면 실행하지 않음
            let calendarList: string[] = [];
            for (let i = 1; i <= this.plugin.settings.calendar_count; i++) {
                const cal = this.plugin.settings[`calendar_${i}`];
                if (cal && typeof cal === 'string' && cal.trim().length > 0) {
                    calendarList.push(cal.trim());
                }
            }
            if (calendarList.length === 0) {
                SummarDebug.log(1, "캘린더 목록이 비어 있어 fetchZoomMeetings를 실행하지 않습니다.");
                resolve([]);
                return;
            }

            args.push(`--fetch-calendars=${calendarList.join(",")}`);
            const scriptPath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath() + "/.obsidian/plugins/summar/fetch_calendar.swift");
            const spawnArgs = [scriptPath, ...args];
            const process = spawn("swift", spawnArgs);
            let output = "";
            let errorOutput = "";

            process.stdout.on("data", (data) => {
                output += data.toString();
            });

            process.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            process.on("close", (code) => {
                if (code === 0) {
                    try {
                        const meetings: ZoomMeeting[] = JSON.parse(output.trim());
                        SummarDebug.Notice(1, "Successfully fetched calendar information.");
                        resolve(meetings);
                    } catch (error) {
                        SummarDebug.error(1, "JSON Parsing Error:", error);
                        SummarDebug.Notice(0, "Failed to parse calendar information: " + (error?.message || error));
                        reject(new Error("Failed to parse Swift output as JSON"));
                    }
                } else {
                    SummarDebug.error(1, "Swift Execution Error:", errorOutput);
                    SummarDebug.Notice(0, "Swift script execution failed: " + errorOutput);
                    reject(new Error("Swift script execution failed"));
                }
            });

            process.on("error", (err) => {
                SummarDebug.error(1, "Swift Process Error:", err);
                reject(new Error("Failed to start Swift process"));
            });

            // unlinkSync(scriptPath);
        });
    }

    async updateScheduledMeetings() {
        SummarDebug.log(1, "🔄 Updating scheduled Zoom meetings...");
        try {
            const meetings = await this.fetchZoomMeetings(); // Swift 실행 결과를 JSON으로 받음

            this.events.length = 0;
            // JSON 데이터를 CalendarEvent[] 타입으로 변환
            // const events: CalendarEvent[] = meetings.map((meeting) => ({
            // 새로운 데이터 추가
            this.events.push(...meetings.map(meeting => ({
                title: meeting.title,
                start: new Date(meeting.start),
                end: new Date(meeting.end),
                description: meeting.description,
                location: meeting.location,
                zoom_link: meeting.zoom_link,
            })));

            // this.timers.forEach(({ timeoutId, title }) => {
            //     clearTimeout(timeoutId);
            //     SummarDebug.log(1, `🗑️ "${title}" 타이머 제거됨`);
            // });
            // this.timers = [];
            this.timers.forEach((timeoutId, start) => {
                clearTimeout(timeoutId);
                SummarDebug.log(1, `🗑️ Timer for "${new Date(start)}" removed`);
            });
            this.timers.clear();


            const MAX_DELAY = this.plugin.settings.calendar_polling_interval * 3;

            // Loop를 돌면서 콘솔 출력
            // events.forEach((event, index) => {
            this.events.forEach((event, index) => {
                SummarDebug.log(1, `📅 Event ${index + 1}: ${event.title}`);
                SummarDebug.log(1, `   ⏳ Start: ${event.start}`);
                SummarDebug.log(1, `   ⏳ End: ${event.end}`);
                // SummarDebug.log(1, `   📍 Location: ${event.location}`);
                // SummarDebug.log(1, `   📝 Description: ${event.description || "No description"}`);
                SummarDebug.log(1, `   🔗 Zoom Link: ${event.zoom_link || "No Zoom link"}`);
                SummarDebug.log(1, "------------------------------------------------");

                const now = new Date();
                const delayMs = event.start.getTime() - now.getTime();

                if (this.plugin.settings.autoLaunchZoomOnSchedule &&
                    delayMs > 0 && delayMs < MAX_DELAY &&
                    !this.timers.has(event.start.getTime()) &&
                    event.zoom_link && event.zoom_link.length > 0) {
                    const timer = setTimeout(async () => {
                        // if (this.plugin.recordingManager.getRecorderState() !== "recording") {
                        //     await this.plugin.recordingManager.startRecording(this.plugin.settings.recordingUnit);
                        // }
                        this.launchZoomMeeting(event.zoom_link as string);
                        clearTimeout(timer);
                    }, delayMs);
                    SummarDebug.log(1, `   🚀 Zoom meeting reserved: ${event.start}`);
                    // this.timers.push({ title: event.title, start: event.start, timeoutId: timer });
                    this.timers.set(event.start.getTime(), timer);
                }
                SummarDebug.log(1, "================================================");
            });
        } catch (error) {
            SummarDebug.error(1, "Error fetching Zoom meetings:", error);
        }
    }

    displayEvents(display?: boolean, containerEl?: HTMLElement) {
        // 기본 containerEl 설정
        if (containerEl) {
            this.eventContainer = containerEl;
        }

        if (display !== undefined) {
            this.autoRecord = display;
        }

        // 스피너와 메시지 표시
        this.eventContainer.innerHTML = '<div class="event-loading"><div class="event-spinner"></div>Loading events...</div>';

        // 이벤트 렌더링(비동기)
        setTimeout(() => {
            this.eventContainer.innerHTML = "";
            this.eventContainer.replaceChildren();
            this.events.forEach((event, index) => {
                const eventEl = this.createEventElement(event, index);
                // autoRecord가 true이고, 해당 이벤트에 zoom_link가 있을 때만 선택 효과
                if (this.autoRecord && event.zoom_link && event.zoom_link.length > 0) {
                    eventEl.classList.add("event-selected");
                } else {
                    eventEl.classList.remove("event-selected");
                }
                this.eventContainer.appendChild(eventEl);
            });
        }, 200); // 0.2초 후 실제 렌더링(실제 fetch라면 fetch 후에 호출)
    }

    createEventElement(event: CalendarEvent, index: number): HTMLElement {
        const eventEl = document.createElement("div");

        // Zoom only 옵션 관련 코드 전체 제거, 모든 이벤트를 그대로 표시
        const formattedDate = event.start.getFullYear().toString().slice(2) +
            String(event.start.getMonth() + 1).padStart(2, "0") +
            event.start.getDate().toString().padStart(2, "0") + "-" +
            event.start.getHours().toString().padStart(2, "0") +
            event.start.getMinutes().toString().padStart(2, "0");

        eventEl.classList.add("event");
        // 강제 색상 지정 제거, 의미별 클래스만 부여
        let strInnerHTML = `
        <div class="event-title">📅 ${event.title}</div>
        <div class="event-time">⏳${event.start.toLocaleString()} - ⏳${event.end.toLocaleString()}</div>`;
        if (event.zoom_link && event.zoom_link.length > 0) {
            strInnerHTML += `<a href="${event.zoom_link}" class="event-zoom-link" target="_blank">🔗Join Zoom Meeting</a>`;
        }
        strInnerHTML += `<a href="#" class="event-obsidian-link">📝 Create Note in Obsidian</a>
    `;
        eventEl.innerHTML = strInnerHTML;

        // const zoomLinkEl = eventEl.querySelector(".event-zoom-link");
        // zoomLinkEl?.addEventListener("click", async (e) => {

        //     if (this.plugin.recordingManager.getRecorderState() !== "recording") {
        //         new ConfirmModal(this.plugin.app, async (shouldRecord: boolean) => {
        //             if (shouldRecord) {
        //                 await this.plugin.recordingManager.startRecording(this.plugin.settings.recordingUnit);
        //             }
        //             }).open();
        //     }
        // });


        // ✅ Open note in new tab in Obsidian
        const obsidianLinkEl = eventEl.querySelector(".event-obsidian-link");
        obsidianLinkEl?.addEventListener("click", (e) => {
            e.preventDefault();
            this.plugin.app.workspace.openLinkText(formattedDate, "", true); // Open in new tab
        });

        return eventEl;
    }

    /**
     * Launches the given Zoom URL. On macOS, uses the 'open' command.
     */
    async launchZoomMeeting(url: string): Promise<void> {
        const execAsync = promisify(exec);
        try {
            SummarDebug.log(1, `Launching Zoom meeting: ${url}`);
            const { stdout, stderr } = await execAsync(`open "${url}"`);
            if (stderr && stderr.trim()) {
                SummarDebug.error(1, "Error occurred while launching Zoom meeting:", stderr);
            }
        } catch (error) {
            SummarDebug.error(1, "Failed to launch Zoom meeting:", error);
        }
    }

    /**
     * Fetches available macOS calendar names using the Swift script.
     * Returns an array of calendar names, null if permission denied, or [] on error.
     */
    async getAvailableCalendars(): Promise<string[] | null> {
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const { normalizePath } = require('obsidian');
            const { FileSystemAdapter } = require('obsidian');
            const basePath = (this.plugin.app.vault.adapter as typeof FileSystemAdapter).getBasePath();
            const scriptPath = normalizePath(basePath + "/.obsidian/plugins/summar/fetch_calendar.swift");
            const process = spawn('swift', [scriptPath, '--list-calendars']);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });
            process.stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });
            process.on('close', (code: number) => {
                const trimmed = output.trim();
                if (trimmed === '-1') {
                    SummarDebug.error(1, '[Calendar] Permission denied.');
                    if (errorOutput) SummarDebug.error(1, '[Calendar][stderr]', errorOutput);
                    resolve(null); // Permission error
                    return;
                }
                try {
                    const result = JSON.parse(trimmed);
                    if (Array.isArray(result)) {
                        if (result.length === 0) {
                            SummarDebug.log(1, '[Calendar] Calendar list is empty.');
                            if (errorOutput) SummarDebug.log(1, '[Calendar][stderr]', errorOutput);
                        }
                        resolve(result);
                    } else {
                        SummarDebug.log(1, '[Calendar] Unexpected result:', result);
                        if (errorOutput) SummarDebug.log(1, '[Calendar][stderr]', errorOutput);
                        resolve([]);
                    }
                } catch (e) {
                    SummarDebug.error(1, '[Calendar] Failed to parse calendar list:', trimmed, e);
                    if (errorOutput) SummarDebug.error(1, '[Calendar][stderr]', errorOutput);
                    resolve([]);
                }
            });
            process.on('error', (err: Error) => {
                SummarDebug.error(1, '[Calendar] Failed to spawn Swift process:', err);
                resolve([]);
            });
        });
    }
}

// class ConfirmModal extends Modal {
//     onSubmit: (result: boolean) => void;

//     constructor(app: App, onSubmit: (result: boolean) => void) {
//         super(app);
//         this.onSubmit = onSubmit;
//     }

//     onOpen() {
//         const { contentEl } = this;
//         contentEl.createEl("h3", { text: "Would you like to start recording?" });

//         const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

//         const yesButton = buttonContainer.createEl("button", { text: "Yes" });
//         yesButton.addEventListener("click", () => {
//             this.close();
//             this.onSubmit(true);
//         });

//         const noButton = buttonContainer.createEl("button", { text: "No" });
//         noButton.addEventListener("click", () => {
//             this.close();
//             this.onSubmit(false);
//         });
//     }

//     onClose() {
//         const { contentEl } = this;
//         contentEl.empty();
//     }
// }