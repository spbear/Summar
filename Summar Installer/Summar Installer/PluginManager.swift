import Foundation
import AppKit

struct PluginManager {
    // 개선된 로케일 감지 함수
    private static func detectCurrentLocale() -> String {
        let preferredLangs = Locale.preferredLanguages
        let langCode = Locale.current.language.languageCode?.identifier ?? "en"
        
        // 사용자의 선호 언어를 우선적으로 확인
        if let firstPreferred = preferredLangs.first {
            if firstPreferred.hasPrefix("ko") {
                return "ko"
            } else if firstPreferred.hasPrefix("ja") {
                return "ja"
            }
        }
        
        // fallback으로 시스템 언어 코드 확인
        if langCode == "ko" {
            return "ko"
        } else if langCode == "ja" {
            return "ja"
        }
        
        return "en"
    }
    
    static func findObsidianVaults() -> [URL] {
        let home = URL(fileURLWithPath: NSHomeDirectoryForUser(NSUserName()) ?? "/Users/Shared", isDirectory: true)

//        print("🔍 Searching for vaults under: \(home.path)")

        var vaults: Set<URL> = []

        let enumerator = FileManager.default.enumerator(
            at: home,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsPackageDescendants]
        )

        while let file = enumerator?.nextObject() as? URL {
            // 디버깅용: 현재 검사 중인 경로 출력
//            print("📂 Checking: \(file.path)")

            if file.lastPathComponent == ".obsidian" {
                let vaultDir = file.deletingLastPathComponent()
//                print("✅ Found vault: \(vaultDir.path)")
                vaults.insert(vaultDir)
            }

            // 깊이 제한: 너무 깊은 경로는 탐색 생략
            let relativeDepth = file.pathComponents.count - home.pathComponents.count
            if relativeDepth >= 3 {
//                print("⏭ Skipping deeper path: \(file.path)")
                enumerator?.skipDescendants()
            }
        }

        let sortedVaults = Array(vaults).sorted(by: { $0.path < $1.path })

        print("📦 Total vaults found: \(sortedVaults.count)")
        sortedVaults.forEach { print("• \($0.path)") }

        return sortedVaults
    }

    static func copyFiles(from source: URL, to destination: URL) throws {
        let items = try FileManager.default.contentsOfDirectory(at: source, includingPropertiesForKeys: nil)
        for item in items {
            let target = destination.appendingPathComponent(item.lastPathComponent)
            try? FileManager.default.removeItem(at: target)
            try FileManager.default.copyItem(at: item, to: target)
        }
    }
    
    // Obsidian vault 설치 완료 알림 (모든 vault 설치 완료 후 한 번만 표시)
    static func notifyInstallationComplete(installedVaults: [String], communityPluginsEnabled: Bool) {
        print("✅ Installation complete for \(installedVaults.count) vault(s): \(installedVaults.joined(separator: ", "))")
        
        // Alert 대신 로그 메시지만 출력
        // UI에서 설치 완료 메시지를 표시함
    }
}
