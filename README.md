# Summar

**Make your Obsidian notes work smarter, not harder! 📝✨ Summar helps you quickly organize, condense, and manage web pages, PDFs, and meeting notes—right inside Obsidian. Effortlessly connect to Confluence, automate calendar and Zoom note-taking, and boost your productivity with handy custom commands. No AI magic here—just a seamless bridge to powerful tools for your workflow. 🚀📚**  

---

## Features

- **Audio (Meeting/Recording) Summarization**: Transcribe and summarize audio files or live recordings
- **Web Page Summarization**: Summarize web content via URL input or context menu
- **PDF Summarization**: Convert and summarize PDF files to Markdown
- **Confluence Integration**: Upload summaries directly to Confluence wiki
- **Calendar Integration & Auto-Recording**: Detect calendar events (especially Zoom meetings) and auto-record/summarize
- **Custom Commands**: Run custom OpenAI prompts on selected text
- **Auto Updates**: Always stay up-to-date with the latest features

---

## Installation & Build

### Option 1: Quick Installation (Recommended)

Download and install the latest version using our installer:

1. **Download the installer**: [Summar Installer.dmg](https://github.com/mcgabby/Summar/releases/latest/download/Summar.Installer.dmg)
2. **Run the installer**: Double-click the downloaded `.dmg` file and follow the installation steps
3. **Security Warning (macOS)**: If you see a warning that the app cannot be opened because it's from an unidentified developer:
   - Go to **System Settings** > **Privacy & Security**
   - Find the message about "Summar Installer was blocked from use because it is not from an identified developer"
   - Click **"Open Anyway"** to proceed with the installation

### Option 2: Manual Build

#### 1. Install dependencies

```bash
npm install
```

#### 2. Build

```bash
npm run build
```

#### 3. Copy to Obsidian plugin folder  
Copy the build output to your Obsidian plugins directory and enable Summar in Obsidian.

---

## Contributing & Issues

- Pull requests and issues are welcome!
- Code style: TypeScript, follow Obsidian plugin guidelines
- Main code: see the `src/` folder

---

## Changelog

- **2025-01-04**: Added web page summarization feature
- **2025-01-07**: Added PDF summarization feature
- **2025-01-08**: Introduced two custom commands and auto-update
- **2025-01-09**: Integrated Confluence Open API
- **2025-01-10**: Refactored codebase for improved efficiency
- **2025-01-27**: Added transcription and summarization features
- **2025-02-01**: Added custom command to run OpenAI API with selected text
- **2025-02-16**: Calendar schedule fetch and auto recording
- **2025-04-17**: Added feature to upload notes to Confluence
- **2025-05-08**: Integrate Gemini API for transcription feature
- **2025-05-16**: Implement summary refinement feature
- **2025-05-20**: Added a feature that automatically starts recording when Zoom is launched
- **2025-05-21**: Add options to append custom command results to note and copy to clipboard
- **2025-05-25**: Improved auto-update mechanism with automatic Obsidian restart after plugin update
- **2025-05-28**: Added summary and refinement generation from transcripts with GitHub release notes integration
- **2025-06-02**: Enhanced settings UI with prompt syncing and key structure refactoring
- **2025-06-12**: Improved calendar integration with dynamic calendar fetching and enhanced UI
- **2025-06-17**: Extended Gemini API support to all features and improved transcription concurrency control
- **2025-06-20**: Added comprehensive API usage statistics and cost tracking with model pricing support
- **2025-06-21**: Implemented duration-based cost calculation for voice models and enhanced audio handling
- **2025-06-26**: Added selective auto-join for accepted Zoom meetings with participant status tracking
- **2025-06-27**: Added automatic calendar integration for meeting-aware recordings and enhanced cost optimization
- **2025-06-27**: Added API call statistics and debug level functionality for better monitoring
- **2025-06-28**: Enhanced meeting information display with better attendees format and multiline description support
- **2025-07-02**: Improved Zoom meeting links to be always clickable with better UI spacing consistency
- **2025-07-03**: Added macOS installer for easy plugin installation and distribution 