import Foundation

struct PluginManager {
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
}
