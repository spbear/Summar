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

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Copy to Obsidian plugin folder  
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