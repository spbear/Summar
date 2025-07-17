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

#### 🔐 Security Warning (macOS) - MDM/Gatekeeper Bypass

If Summar Installer is blocked by macOS security policies or MDM, the DMG includes a troubleshooting guide to help you resolve this:

**Included Solution:**
- **If Installation Blocked.html** - Bilingual troubleshooting guide (Korean/English auto-detected) with step-by-step instructions

**Quick Resolution Methods:**
1. **Fastest method**: Right-click `Summar Installer.app` → Select "Open" → Click "Open" in security dialog
2. **System Settings method**: 
   - Go to **System Settings** > **Privacy & Security** > **Security** section
   - Find the message about "Summar Installer was blocked"
   - Click **"Open Anyway"** or **"Allow"** 
3. **Use the guide**: If installation is blocked, open the troubleshooting guide HTML file in the DMG

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

## Documentation

For detailed usage instructions, feature explanations, and tips on how to effectively use all of Summar's capabilities, please refer to our comprehensive user manual:

### 📖 **[User Manual](docs/user-manual.md)** - Complete guide covering all features, settings, and integrations

The user manual includes:
- Step-by-step configuration guides for all settings tabs
- Complete feature explanations for SummarView interface
- Command palette and context menu integrations
- Keyboard shortcuts and tips for optimal usage
- Platform-specific features and limitations

---

## Advanced Documentation

For developers and advanced users, additional technical documentation is available:

### 📋 **[Transcription Summary PRD](docs/transcription-summary-prd.md)** - Product Requirements Document
Comprehensive technical specification for the transcription and summarization features, including:
- Detailed feature requirements and user scenarios
- Audio-to-text (STT) and text summarization workflows
- File naming conventions and folder structures
- Configuration options and error handling
- Future feature ideation and implementation considerations

### ⚙️ **[Configuration Schema Documentation](docs/json-schema.md)** - Settings & Data Structure Guide
Complete reference for Summar's configuration files and data structures:
- JSON schema documentation for all configuration files
- Settings structure and data types for each feature tab
- Migration guides between configuration versions
- API integration settings and model configurations
- Troubleshooting configuration-related issues

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
- **2025-07-05**: Added Daily Notes integration for automatic meeting note linking and optimized transcription workflow
- **2025-07-06**: Updated app icon design and improved UI consistency across all platforms
- **2025-07-07**: Enhanced calendar event prioritization with improved scoring system and refactored file loading for better error handling
- **2025-07-08**: Added 2-hour recording time limit with modal confirmation, enhanced plugin loading with indicators, and improved calendar data loading with error handling
- **2025-07-08**: Improved recording confirmation modal layout and fixed button text overflow issues
- **2025-07-10**: Updated manifest.json and improved version management
- **2025-07-11**: Enhanced JSON schema documentation with detailed file loading order and user settings protection
- **2025-07-12**: Refactored settings structure to v2.0 with model-specific STT prompt configurations and enhanced migration process
- **2025-07-12**: Added comprehensive user manual documentation with detailed feature guides and tips for optimal usage 