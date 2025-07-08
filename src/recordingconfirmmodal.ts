import { App, Modal, Setting } from "obsidian";

export class RecordingConfirmModal extends Modal {
    private onConfirm: (continueRecording: boolean) => void;
    private countdownInterval: number | null = null;
    private remainingTime: number = 30;
    private countdownElement: HTMLElement | null = null;

    constructor(app: App, onConfirm: (continueRecording: boolean) => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Play beep sound
        this.playBeepSound();
        
        // Modal styling
        contentEl.classList.add("summar-recording-confirm-modal");
        
        // Set modal dimensions
        this.modalEl.style.width = "450px";
        this.modalEl.style.maxWidth = "90vw";
        
        // Title
        const title = contentEl.createEl("h2", { 
            text: "Recording Time Limit Reached",
            cls: "summar-modal-title"
        });
        
        // Warning icon and message
        const messageContainer = contentEl.createEl("div", { cls: "summar-modal-message" });
        const warningIcon = messageContainer.createEl("div", { 
            cls: "summar-modal-icon",
            text: "⚠️"
        });
        
        const message = messageContainer.createEl("p", {
            text: "You have been recording for over 2 hours. Do you want to continue recording?",
            cls: "summar-modal-text"
        });
        
        // Countdown display
        this.countdownElement = messageContainer.createEl("div", {
            cls: "summar-modal-countdown"
        });
        this.updateCountdown();
        
        // Button container
        const buttonContainer = contentEl.createEl("div", { cls: "summar-modal-buttons" });
        
        // Continue button
        const continueButton = buttonContainer.createEl("button", {
            text: "Continue Recording",
            cls: "mod-cta summar-modal-button-continue"
        });
        continueButton.addEventListener("click", () => {
            this.handleConfirm(true);
        });
        
        // Stop button
        const stopButton = buttonContainer.createEl("button", {
            text: "Stop Recording",
            cls: "mod-warning summar-modal-button-stop"
        });
        stopButton.addEventListener("click", () => {
            this.handleConfirm(false);
        });
        
        // Start countdown
        this.startCountdown();
        
        // Focus on continue button by default
        continueButton.focus();
        
        // Handle ESC key
        this.scope.register([], "Escape", () => {
            this.handleConfirm(false);
        });
    }
    
    private startCountdown() {
        this.countdownInterval = window.setInterval(() => {
            this.remainingTime--;
            this.updateCountdown();
            
            if (this.remainingTime <= 0) {
                this.handleConfirm(false); // Auto-stop recording
            }
        }, 1000);
    }
    
    private updateCountdown() {
        if (this.countdownElement) {
            this.countdownElement.textContent = `Auto-stop in ${this.remainingTime} seconds`;
        }
    }
    
    private handleConfirm(continueRecording: boolean) {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        
        this.onConfirm(continueRecording);
        this.close();
    }
    
    private playBeepSound() {
        try {
            // Create a simple beep sound using Web Audio API
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800; // 800Hz beep
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.warn('Could not play beep sound:', error);
        }
    }
    
    onClose() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        
        const { contentEl } = this;
        contentEl.empty();
    }
}
