import Foundation

class InstallerLogic {
    let log: (String) -> Void

    init(logHandler: @escaping (String) -> Void) {
        self.log = logHandler
    }

    func installPlugin(from url: URL, into vaults: [URL]) async throws {
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

        for vault in vaults {
            let pluginDir = vault.appendingPathComponent(".obsidian/plugins/summar")
            try? FileManager.default.createDirectory(at: pluginDir, withIntermediateDirectories: true)
            try PluginManager.copyFiles(from: extractedPath, to: pluginDir)
            log("📂 Installed plugin to: \(pluginDir.path)")
        }

        try? FileManager.default.removeItem(at: tempDir)
        log("🧽 Cleaned up temporary files.")
    }
}
