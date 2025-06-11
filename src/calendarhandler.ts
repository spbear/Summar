import { Platform, normalizePath, FileSystemAdapter, Modal, App } from "obsidian";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { SWIFT_SCRIPT_TEMPLATE, SummarDebug } from "./globals";
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

    formatPrintf(template: string, ...args: any[]): string {
        let i = 0;
        return template.replace(/%[sd]/g, (match) => {
            if (i >= args.length) return match; // 인자 부족 시 그대로 둠
            return match === "%d" ? Number(args[i++]).toString() : String(args[i++]);
        });
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

            let calendarNames ="";
            for (let i = 1; i <= this.plugin.settings.calendar_count; i++) {
                calendarNames += "\"" + this.plugin.settings[`calendar_${i}`] + "\", ";
            }

            const scriptPath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath() + "/.obsidian/plugins/summar/fetch_calendar.swift");
            const scriptFile = this.formatPrintf(SWIFT_SCRIPT_TEMPLATE, this.plugin.settings.calendar_fetchdays, calendarNames);
            writeFileSync(scriptPath, scriptFile, "utf-8");

            const process = spawn("swift", [scriptPath]);
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
            this.eventContainer = containerEl; // 기본 컨테이너 엘리먼트를 참조하도록 수정
        }

        if (display !== undefined) {
            this.autoRecord = display;
        }

        // 이전에 표시된 내용을 모두 삭제
        this.eventContainer.innerHTML = "";
        this.eventContainer.replaceChildren(); // 모든 자식 요소 제거

        // display가 true일 경우에만 이벤트 표시
        // if (this.autoRecord) {
            this.events.forEach((event, index) => {
                const eventEl = this.createEventElement(event, index);
                this.eventContainer.appendChild(eventEl);
            });
        // }
        if (this.autoRecord) {
            this.eventContainer.style.opacity = "1";
        } else {
            this.eventContainer.style.opacity = "0.4";
        }
    }

    createEventElement(event: CalendarEvent, index: number): HTMLElement {
        const eventEl = document.createElement("div");

        if (!this.plugin.settings.calendar_zoom_only || (event.zoom_link && event.zoom_link.length >0 )) {
            const formattedDate = event.start.getFullYear().toString().slice(2) +
                String(event.start.getMonth() + 1).padStart(2, "0") +
                event.start.getDate().toString().padStart(2, "0") + "-" +
                event.start.getHours().toString().padStart(2, "0") +
                event.start.getMinutes().toString().padStart(2, "0");

            eventEl.classList.add("event");
            // eventEl.innerHTML = `
            let strInnerHTML = `
            <div class="event-title">📅 ${event.title}</div>
            <div class="event-time">⏳${event.start.toLocaleString()} - ⏳${event.end.toLocaleString()}</div>`;
            if (event.zoom_link && event.zoom_link.length > 0) {
                strInnerHTML += `<a href="${event.zoom_link}" class="event-zoom-link" target="_blank">🔗Join Zoom Meeting</a>`;
            }
            strInnerHTML += `<a href="#" class="event-obsidian-link">📝 Create Note in Obsidian</a>
            <p>
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

        }
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