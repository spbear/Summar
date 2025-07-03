import SwiftUI

struct ManifestInfo: Decodable {
    let version: String
}

func fetchManifestVersion(completion: @escaping (String?) -> Void) {
    let url = URL(string: "https://github.com/mcgabby/Summar/releases/latest/download/manifest.json")!
    let task = URLSession.shared.dataTask(with: url) { data, _, error in
        guard let data = data, error == nil else {
            print("❌ Failed to download manifest: \(error?.localizedDescription ?? "unknown error")")
            completion(nil)
            return
        }

        do {
            let manifest = try JSONDecoder().decode(ManifestInfo.self, from: data)
            completion(manifest.version)
        } catch {
            print("❌ Failed to decode manifest: \(error)")
            completion(nil)
        }
    }
    task.resume()
}

struct ContentView: View {
    @State private var pluginVersion: String = "..." // 로딩 중 상태 표시
    @State private var vaults: [URL] = []
    @State private var selectedVaults: Set<URL> = []
    @State private var isInstalling = false
    @State private var logMessages: [String] = []
    @State private var installComplete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("🧊 Summar Installer (\(pluginVersion))")
                .font(.title)
                .bold()

            if vaults.isEmpty {
                Button("🔍 Search for Obsidian Vaults") {
                    vaults = PluginManager.findObsidianVaults()
                }
            } else {
                Text("📂 Select Vaults:")
                List(vaults, id: \.self, selection: $selectedVaults) {
                    Text($0.path)
                }
                .frame(height: 200)
            }

            Button(isInstalling ? "Installing..." : "✅ Install Plugin") {
                install()
            }
            .disabled(isInstalling || selectedVaults.isEmpty)
            .padding(.top, 8)

            if !logMessages.isEmpty {
                Text("📋 Log")
                    .font(.headline)
                ScrollView {
                    ForEach(logMessages, id: \.self) { log in
                        Text(log).font(.caption).padding(.bottom, 2)
                    }
                }
                .frame(height: 160)
            }

            if installComplete {
                Text("🎉 Installation Complete!")
                    .font(.title2)
                    .foregroundColor(.green)
                    .padding(.top, 10)
            }
        }
        .onAppear {
            fetchManifestVersion { version in
                DispatchQueue.main.async {
                    self.pluginVersion = version ?? "unknown"
                }
            }
        }
        .padding()
        .frame(width: 600)
    }

    func install() {
        isInstalling = true
        logMessages = []
        installComplete = false

        Task {
            do {
                let pluginURL = URL(string: "https://github.com/mcgabby/Summar/releases/latest/download/summar.zip")!
                let installer = InstallerLogic(logHandler: { log in
                    DispatchQueue.main.async {
                        logMessages.append(log)
                    }
                })

                try await installer.installPlugin(
                    from: pluginURL,
                    into: Array(selectedVaults)
                )

                DispatchQueue.main.async {
                    installComplete = true
                    isInstalling = false
                }
            } catch {
                logMessages.append("❌ Installation failed: \(error.localizedDescription)")
                isInstalling = false
            }
        }
    }
}
