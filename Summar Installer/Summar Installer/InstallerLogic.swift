import Foundation

class InstallerLogic {
    let log: (String) -> Void

    init(logHandler: @escaping (String) -> Void) {
        self.log = logHandler
    }

    // Swift runtime 체크 및 설치
    func checkAndInstallSwiftRuntime() async throws {
        log("🔍 Checking Swift runtime...")
        
        if isSwiftRuntimeInstalled() {
            log("✅ Swift runtime is already installed")
            return
        }
        
        log("⚠️ Swift runtime not found. Installing...")
        try await installSwiftRuntime()
        
        // 설치 후 재확인
        if isSwiftRuntimeInstalled() {
            log("✅ Swift runtime installed successfully")
        } else {
            throw InstallerError.swiftRuntimeInstallationFailed
        }
    }
    
    private func isSwiftRuntimeInstalled() -> Bool {
        // Swift 명령어가 존재하고 실행 가능한지 확인
        let swiftPaths = [
            "/usr/bin/swift",
            "/usr/local/bin/swift",
            "/opt/homebrew/bin/swift"
        ]
        
        for path in swiftPaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                // swift --version 명령어로 실제 동작 확인
                let process = Process()
                process.executableURL = URL(fileURLWithPath: path)
                process.arguments = ["--version"]
                
                let pipe = Pipe()
                process.standardOutput = pipe
                process.standardError = pipe
                
                do {
                    try process.run()
                    process.waitUntilExit()
                    
                    if process.terminationStatus == 0 {
                        let data = pipe.fileHandleForReading.readDataToEndOfFile()
                        if let output = String(data: data, encoding: .utf8), 
                           output.lowercased().contains("swift") {
                            return true
                        }
                    }
                } catch {
                    continue
                }
            }
        }
        
        return false
    }
    
    private func installSwiftRuntime() async throws {
        // Xcode Command Line Tools 설치 시도
        log("📦 Installing Xcode Command Line Tools (includes Swift runtime)...")
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/xcode-select")
        process.arguments = ["--install"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        try process.run()
        
        // 프로세스가 완료될 때까지 대기 (최대 30초)
        let startTime = Date()
        while process.isRunning {
            if Date().timeIntervalSince(startTime) > 30 {
                process.terminate()
                throw InstallerError.swiftRuntimeInstallationTimeout
            }
            try await Task.sleep(nanoseconds: 500_000_000) // 0.5초 대기
        }
        
        if process.terminationStatus != 0 {
            // Command Line Tools가 이미 설치되어 있거나 다른 방법으로 설치 시도
            log("ℹ️ Xcode Command Line Tools might already be installed or installation dialog appeared")
            
            // 사용자에게 Homebrew를 통한 Swift 설치 안내
            try await installSwiftViaHomebrew()
        }
    }
    
    private func installSwiftViaHomebrew() async throws {
        log("🍺 Attempting to install Swift via Homebrew...")
        
        // Homebrew가 설치되어 있는지 확인
        let homebrewPaths = [
            "/usr/local/bin/brew",
            "/opt/homebrew/bin/brew"
        ]
        
        var brewPath: String?
        for path in homebrewPaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                brewPath = path
                break
            }
        }
        
        guard let validBrewPath = brewPath else {
            // Homebrew가 없으면 설치 안내
            throw InstallerError.homebrewNotFound
        }
        
        // brew install swift 실행
        let process = Process()
        process.executableURL = URL(fileURLWithPath: validBrewPath)
        process.arguments = ["install", "swift"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        try process.run()
        
        // 설치 완료까지 대기 (최대 5분)
        let startTime = Date()
        while process.isRunning {
            if Date().timeIntervalSince(startTime) > 300 { // 5분
                process.terminate()
                throw InstallerError.swiftRuntimeInstallationTimeout
            }
            try await Task.sleep(nanoseconds: 1_000_000_000) // 1초 대기
        }
        
        if process.terminationStatus != 0 {
            throw InstallerError.swiftRuntimeInstallationFailed
        }
    }

    func installPlugin(from url: URL, into vaults: [URL]) async throws {
        // Swift runtime 체크를 먼저 수행
        try await checkAndInstallSwiftRuntime()
        
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("SummarInstaller")
        let zipPath = tempDir.appendingPathComponent("summar.zip")
        let extractedPath = tempDir.appendingPathComponent("unzipped")

        try? FileManager.default.removeItem(at: tempDir)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

        log("🌐 Downloading plugin...")
        let (data, _) = try await URLSession.shared.data(from: url)
        try data.write(to: zipPath)
        log("✅ ZIP downloaded to \(zipPath.path)")

        log("📦 Extracting ZIP...")
        try FileManager.default.createDirectory(at: extractedPath, withIntermediateDirectories: true)

        let archiveTool = Process()
        archiveTool.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        archiveTool.arguments = ["-o", zipPath.path, "-d", extractedPath.path]
        try archiveTool.run()
        archiveTool.waitUntilExit()
        log("✅ Unzipped to \(extractedPath.path)")

        var installedVaults: [String] = []
        var anyPluginActivated = false

        for vault in vaults {
            let obsidianDir = vault.appendingPathComponent(".obsidian")
            let pluginDir = obsidianDir.appendingPathComponent("plugins/summar")
            
            // .obsidian 디렉토리 생성
            try? FileManager.default.createDirectory(at: obsidianDir, withIntermediateDirectories: true)
            
            // 플러그인 파일 복사
            try? FileManager.default.createDirectory(at: pluginDir, withIntermediateDirectories: true)
            try PluginManager.copyFiles(from: extractedPath, to: pluginDir)
            log("📂 Installed plugin to: \(pluginDir.path)")
            
            // 커뮤니티 플러그인 활성화 및 Summar 플러그인 enable
            let communityPluginsWereEnabled = try enableCommunityPlugins(in: obsidianDir)
            log("🚀 Enabled community plugins and Summar plugin")
            
            // 설치된 vault 목록에 추가
            installedVaults.append(vault.lastPathComponent)
            
            // 하나라도 커뮤니티 플러그인이 새로 활성화되었으면 기록
            if communityPluginsWereEnabled {
                anyPluginActivated = true
            }
        }

        // 모든 설치 완료 후 한 번만 알림 표시
        PluginManager.notifyInstallationComplete(installedVaults: installedVaults, communityPluginsEnabled: anyPluginActivated)

        try? FileManager.default.removeItem(at: tempDir)
        log("🧽 Cleaned up temporary files.")
    }
    
    // 커뮤니티 플러그인 활성화 및 Summar 플러그인 enable
    // 반환값: 커뮤니티 플러그인을 새로 활성화했는지 여부
    private func enableCommunityPlugins(in obsidianDir: URL) throws -> Bool {
        var communityPluginsWereEnabled = false
        // 1. core-plugins.json 확인 (이미 존재하면 건드리지 않음)
        let corePluginsPath = obsidianDir.appendingPathComponent("core-plugins.json")
        if !FileManager.default.fileExists(atPath: corePluginsPath.path) {
            let defaultCorePlugins = [
                "file-explorer", "global-search", "switcher", "graph", "backlink", "canvas",
                "outgoing-link", "tag-pane", "properties", "page-preview", "daily-notes",
                "templates", "note-composer", "command-palette", "slash-command",
                "editor-status", "bookmarks", "markdown-importer", "zk-prefixer",
                "random-note", "outline", "word-count", "slides", "audio-recorder",
                "workspaces", "file-recovery", "publish", "sync"
            ]
            
            let corePluginsData = try JSONSerialization.data(withJSONObject: defaultCorePlugins, options: .prettyPrinted)
            try corePluginsData.write(to: corePluginsPath)
        }
        
        // 2. core-plugins-migration.json 확인 (이미 존재하면 건드리지 않음)
        let migrationPath = obsidianDir.appendingPathComponent("core-plugins-migration.json")
        if !FileManager.default.fileExists(atPath: migrationPath.path) {
            let migrationData: [String: Bool] = [
                "file-explorer": true, "global-search": true, "switcher": true, "graph": true,
                "backlink": true, "canvas": true, "outgoing-link": true, "tag-pane": true,
                "properties": true, "page-preview": true, "daily-notes": true, "templates": true,
                "note-composer": true, "command-palette": true, "slash-command": false,
                "editor-status": true, "bookmarks": true, "markdown-importer": true,
                "zk-prefixer": false, "random-note": false, "outline": true, "word-count": false,
                "slides": false, "audio-recorder": false, "workspaces": false,
                "file-recovery": true, "publish": false, "sync": false
            ]
            
            let migrationJsonData = try JSONSerialization.data(withJSONObject: migrationData, options: .prettyPrinted)
            try migrationJsonData.write(to: migrationPath)
        }
        
        // 3. community-plugins.json 업데이트 (Summar만 추가, 기존 설정 유지)
        let communityPluginsPath = obsidianDir.appendingPathComponent("community-plugins.json")
        var communityPlugins: [String] = []
        
        if let existingData = try? Data(contentsOf: communityPluginsPath),
           let existingPlugins = try? JSONSerialization.jsonObject(with: existingData) as? [String] {
            communityPlugins = existingPlugins
        }
        
        if !communityPlugins.contains("summar") {
            communityPlugins.append("summar")
            let communityPluginsData = try JSONSerialization.data(withJSONObject: communityPlugins, options: .prettyPrinted)
            try communityPluginsData.write(to: communityPluginsPath)
        }
        
        // 4. app.json 설정 확인 및 최소한의 변경
        let appConfigPath = obsidianDir.appendingPathComponent("app.json")
        var needsUpdate = false
        var appConfig: [String: Any] = [:]
        
        if let existingData = try? Data(contentsOf: appConfigPath),
           let existingConfig = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any] {
            appConfig = existingConfig
            
            // enabledPlugins에 summar가 없다면 추가
            var enabledPlugins = appConfig["enabledPlugins"] as? [String] ?? []
            if !enabledPlugins.contains("summar") {
                enabledPlugins.append("summar")
                appConfig["enabledPlugins"] = enabledPlugins
                needsUpdate = true
                
                // enabledPlugins가 비어있었거나 처음 생성되는 경우 커뮤니티 플러그인을 새로 활성화한 것으로 간주
                if enabledPlugins.count == 1 {
                    communityPluginsWereEnabled = true
                }
            }
        } else {
            // app.json이 없는 경우에만 기본 설정으로 생성
            communityPluginsWereEnabled = true  // 처음 생성하는 경우
            appConfig = [
                "legacyEditor": false,
                "livePreview": true,
                "showLineNumber": false,
                "spellcheck": false,
                "spellcheckLanguages": NSNull(),
                "translate": true,
                "useMarkdownLinks": false,
                "newFileLocation": "folder",
                "newFileFolderPath": "/",
                "attachmentFolderPath": "/",
                "showUnsupportedFiles": false,
                "deleteFileOption": "trash",
                "alwaysUpdateLinks": false,
                "newLinkFormat": "shortest",
                "useTab": true,
                "tabSize": 4,
                "foldHeading": true,
                "foldIndent": true,
                "showFrontmatter": true,
                "communityPluginSortOrder": "alphabetical",
                "enabledPlugins": ["summar"]
            ]
            needsUpdate = true
        }
        
        if needsUpdate {
            let appConfigData = try JSONSerialization.data(withJSONObject: appConfig, options: .prettyPrinted)
            try appConfigData.write(to: appConfigPath)
        }
        
        // 5. workspace.json 생성 (기본 워크스페이스, 파일이 없을 때만)
        let workspacePath = obsidianDir.appendingPathComponent("workspace.json")
        if !FileManager.default.fileExists(atPath: workspacePath.path) {
            let workspaceConfig: [String: Any] = [
                "main": [
                    "id": "main",
                    "type": "split",
                    "children": [
                        [
                            "id": "file-explorer",
                            "type": "leaf",
                            "state": [
                                "type": "file-explorer",
                                "state": [
                                    "sortOrder": "alphabetical"
                                ]
                            ]
                        ]
                    ]
                ],
                "left": [
                    "id": "left",
                    "type": "split",
                    "children": [
                        [
                            "id": "file-explorer-tab",
                            "type": "leaf",
                            "state": [
                                "type": "file-explorer",
                                "state": [
                                    "sortOrder": "alphabetical"
                                ]
                            ]
                        ]
                    ],
                    "currentTab": 0
                ],
                "right": [
                    "id": "right",
                    "type": "split",
                    "children": [],
                    "currentTab": 0
                ],
                "active": "file-explorer",
                "lastOpenFiles": []
            ]
            
            let workspaceData = try JSONSerialization.data(withJSONObject: workspaceConfig, options: .prettyPrinted)
            try workspaceData.write(to: workspacePath)
        }
        
        return communityPluginsWereEnabled
    }
}

// Swift runtime 설치 관련 에러 타입
enum InstallerError: Error, LocalizedError {
    case swiftRuntimeInstallationFailed
    case swiftRuntimeInstallationTimeout
    case homebrewNotFound
    
    var errorDescription: String? {
        switch self {
        case .swiftRuntimeInstallationFailed:
            return "Swift runtime installation failed. Please install Xcode Command Line Tools manually by running 'xcode-select --install' in Terminal."
        case .swiftRuntimeInstallationTimeout:
            return "Swift runtime installation timed out. Please install Xcode Command Line Tools manually."
        case .homebrewNotFound:
            return "Neither Xcode Command Line Tools nor Homebrew found. Please install one of them first.\n\nTo install Xcode Command Line Tools: xcode-select --install\nTo install Homebrew: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        }
    }
}
