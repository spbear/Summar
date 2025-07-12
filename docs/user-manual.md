# Summar Plugin Tips & Features Guide

This document provides a comprehensive guide to all the features and user actions available in the Summar plugin.

## 1. SummarSettingTab Features

The Summar plugin settings are organized into multiple tabs, each offering specific configuration options:

### Common Tab
- **API Configuration**: Set up OpenAI API Key, OpenAI API Endpoint URL, and Gemini API Key
- **Confluence Integration**: Configure Confluence API Token, Domain, and Parent Page settings
  - Toggle Confluence API usage on/off
  - Enter Confluence Parent Page URL to automatically extract Space Key and Page ID
  - Use the "✓" button to validate and auto-populate Confluence settings
- **Version Management**: View current plugin version and check for updates
  - Force update button becomes available when new versions are detected
  - Automatic Obsidian restart after plugin updates

### Webpage Tab
- **Model Selection**: Choose AI model for web page summarization (gpt-4o, gpt-4.1, o1-mini, o3-mini)
- **Prompt Management**: 
  - Edit custom prompts for web page summarization
  - "Set default prompt" button to restore original settings
  - "Revert" button to undo changes since tab activation
- **Real-time Validation**: Buttons enable/disable based on content changes

### PDF Tab (macOS/Desktop only)
- **Model Selection**: Choose AI model for PDF to Markdown conversion
- **Prompt Management**: Same functionality as Webpage tab
  - Custom prompts for PDF processing
  - Set default and revert buttons with smart state management

### Recording Tab
- **Audio Device Selection**: Choose recording device from available audio inputs
- **Storage Configuration**: Set temporary folder for audio files and transcriptions
- **Language Settings**: Select transcription language (Auto Detect, Korean, Japanese, English, Chinese, Thai, Vietnamese)
- **Model Configuration**: 
  - STT (Speech-to-Text) model selection
  - Transcript summary model selection
  - Custom prompts for STT and summarization with set default/revert functionality
- **Recording Settings**:
  - Recording unit (1-20 seconds)
  - Toggle for saving transcripts to new notes
  - Daily Notes integration toggle (when Daily Notes plugin is enabled)
- **Summary Refinement**: 
  - Toggle summary refinement feature
  - Custom prompts for refining summaries
  - Set default/revert functionality for refinement prompts

### Custom Command Tab
- **Command Management**: Create up to 10 custom commands
- **Command Configuration**:
  - Menu name for context menu display
  - AI model selection (gpt-4o, gpt-4.1, o1-mini, o3-mini)
  - Custom prompt for selected text processing
  - Hotkey assignment (supports Ctrl/Cmd + Shift + Alt combinations)
  - Result handling options:
    - "Append Results to Note" - adds results to current note
    - "Copy Results to Clipboard" - copies results to clipboard
- **Command Actions**:
  - "Add Command" button to create new commands
  - "Remove Command" (trash icon) to delete existing commands

### Schedule Tab (macOS/Desktop only)
- **Calendar Integration**: Add up to 5 macOS calendars for event detection
- **Auto-Launch Settings**:
  - Toggle automatic Zoom meeting launch
  - Option to launch only accepted meetings
- **Calendar Management**:
  - "Add Calendar" button to add calendar sources
  - Individual calendar selection dropdowns
  - Remove calendar functionality

### Stats Tab
- **API Usage Statistics**: Visual dashboard showing:
  - Total API calls, tokens used, and costs
  - Success rates and average latency
  - Feature-wise breakdown with interactive charts
  - Model usage statistics with cost tracking

## 2. SummarView Features

The SummarView provides a dedicated interface for interacting with Summar features:

### Input Controls
- **URL Input Field**: Enter web page URLs for summarization
- **GO Button**: Fetch and summarize web pages
- **PDF Button**: Convert PDF files to Markdown (macOS/Desktop only)
- **Record Button**: Start/stop audio recording with "[●] record" label

### Action Buttons
- **Upload to Confluence Button** (file-up icon): 
  - Upload current note content to Confluence wiki
  - Automatically detects note type and formats accordingly
  - Shows success/failure notifications with links to created pages
- **New Note Button** (file-output icon):
  - Create new notes from summarization results
  - Auto-generates timestamped filenames
  - Opens created notes automatically

### Result Display
- **Result Container**: Large text area displaying:
  - Summarization progress and status
  - Final results and error messages
  - Real-time updates during processing

### Status Integration
- **Dynamic Button States**: Buttons enable/disable based on:
  - Available content for processing
  - API key configuration
  - Platform compatibility (PDF/Calendar features)

## 3. Command Palette Integrations

Access Summar features through Obsidian's Command Palette (Ctrl/Cmd+P):

### Built-in Commands
- **"Summarize web page"**: Opens URL input dialog for web page summarization
- **"Convert PDF to Markdown"**: Opens file dialog for PDF processing
- **"Start/Stop recording"**: Toggle audio recording (default hotkey: Ctrl/Cmd+R)
- **"Summarize meeting from audio file"**: Select single audio file for transcription
- **"Summarize meeting from multiple audio files"**: Select multiple audio files or folders
- **"Show Summar stats"**: Open API usage statistics dashboard

### Custom Commands
- **User-defined Commands**: Each custom command appears in the palette with:
  - User-specified command name
  - Assigned hotkey (if configured)
  - Text selection requirement for execution

### Command Behavior
- **Text Selection**: Commands automatically select current line if no text is selected
- **Result Handling**: Based on command configuration (append to note/copy to clipboard)
- **Error Handling**: Commands show appropriate error messages for missing API keys or configuration

## 4. File Explorer Integrations

Right-click context menus in Obsidian's file explorer provide direct access to Summar features:

### Audio File Context Menu
For audio files (.mp3, .wav, .webm, .ogg, .m4a):
- **"Summarize meeting from audio file"**: Direct transcription and summarization
- Automatically activates SummarView and processes the file
- Supports meeting information extraction from calendar events

### PDF File Context Menu (macOS/Desktop only)
For PDF files:
- **"Convert PDF to Markdown"**: Direct PDF to Markdown conversion
- Processes file and displays results in SummarView

### Transcript File Context Menu
For files containing " transcript.md" in the name:
- **"Summarize meeting from transcript file"**: Generate summary from existing transcript
- Reads transcript content and creates summary

### Folder Context Menu
For folders containing audio or webm files:
- **"Summarize meeting from multiple audio files"**: Process all audio files in folder
- Automatically filters and processes relevant audio files
- Combines multiple files for comprehensive meeting transcription

## 5. Text Selection Context Menu

Right-click on selected text in notes to access custom commands:

### Dynamic Menu Items
- **Custom Command Names**: User-defined menu items appear based on configured custom commands
- **Text Processing**: Selected text is sent to AI models with custom prompts
- **Automatic Selection**: If no text is selected, automatically selects current line

### Execution Behavior
- **Immediate Processing**: Commands execute immediately upon selection
- **Progress Indication**: SummarView shows processing status
- **Result Integration**: Results can be appended to note or copied to clipboard based on command settings

### Error Handling
- **API Key Validation**: Commands check for required API keys before execution
- **Model Availability**: Validates selected AI model availability
- **Graceful Failure**: Shows descriptive error messages for common issues

## 6. Link Context Menu Integration

Right-click on links in notes to access web page summarization:

### URL Processing
- **"Summary web page using Summar"**: Direct web page summarization from links
- **Automatic Activation**: Opens SummarView and begins processing
- **Link Validation**: Handles various URL formats and protocols

### Integration Features
- **Context Preservation**: Maintains note context while processing external content
- **Result Display**: Shows summarization progress and results in SummarView
- **Error Handling**: Graceful handling of invalid URLs or network issues

## Additional Tips

### Keyboard Shortcuts
- **Ctrl/Cmd+R**: Start/stop recording (default hotkey)
- **Custom Hotkeys**: User-defined hotkeys for custom commands
- **Escape**: Cancel operations in modal dialogs

### Status Bar Integration
- **Recording Status**: Visual indicator when recording is active
- **Calendar Status**: Shows calendar integration status (red when active, muted when inactive)
  - **Interactive Calendar Icon**: Click the calendar icon to open plugin settings with Schedule tab pre-selected

### File Naming Conventions
- **Auto-generated Names**: Timestamped files with format YYMMDD-HHMM
- **Smart Extensions**: Automatic .md extension for note files
- **Conflict Resolution**: Handles duplicate filenames gracefully

### Platform-Specific Features
- **macOS Exclusive**: PDF processing, Calendar integration, Schedule management
- **Cross-Platform**: Web summarization, Custom commands, Basic recording features

### Configuration Best Practices
- **API Key Security**: Store API keys securely in plugin settings
- **Model Selection**: Choose appropriate models based on task complexity and cost
- **Prompt Optimization**: Customize prompts for specific use cases and languages
- **Resource Management**: Monitor API usage through Stats dashboard
