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
    @State private var installedVaultNames: [String] = []
    @State private var currentLocale: String = ""
    
    // 다국어 지원을 위한 locale 감지
    private func detectLocale() -> String {
        let preferredLangs = Locale.preferredLanguages
        
        // 사용자의 선호 언어를 우선적으로 확인
        if let firstPreferred = preferredLangs.first {
            if firstPreferred.hasPrefix("ko") {
                return "ko"
            } else if firstPreferred.hasPrefix("ja") {
                return "ja"
            }
        }
        
        // fallback으로 시스템 언어 코드 확인
        let langCode = Locale.current.language.languageCode?.identifier ?? "en"
        if langCode == "ko" {
            return "ko"
        } else if langCode == "ja" {
            return "ja"
        }
        
        return "en"
    }
    
    // 다국어 텍스트들
    private var searchButtonText: String {
        switch currentLocale {
        case "ko": return "🔍 Obsidian Vault 찾기"
        case "ja": return "🔍 Obsidian Vaultを検索"
        default: return "🔍 Search for Obsidian Vaults"
        }
    }
    
    private var selectVaultsText: String {
        switch currentLocale {
        case "ko": return "📂 Vault 선택:"
        case "ja": return "📂 Vaultを選択："
        default: return "📂 Select Vaults:"
        }
    }
    
    private var installButtonText: String {
        switch currentLocale {
        case "ko": return "✅ 플러그인 설치"
        case "ja": return "✅ プラグインのインストール"
        default: return "✅ Install Plugin"
        }
    }
    
    private var installingText: String {
        switch currentLocale {
        case "ko": return "설치 중..."
        case "ja": return "インストール中..."
        default: return "Installing..."
        }
    }
    
    private var logText: String {
        switch currentLocale {
        case "ko": return "📋 로그"
        case "ja": return "📋 ログ"
        default: return "📋 Log"
        }
    }
    
    private var installCompleteText: String {
        switch currentLocale {
        case "ko": return "🎉 설치 완료!"
        case "ja": return "🎉 インストール完了！"
        default: return "🎉 Installation Complete!"
        }
    }
    
    private var vaultsReloadedText: String {
        switch currentLocale {
        case "ko": return "📋 다음 단계를 따라주세요:"
        case "ja": return "📋 次の手順に従ってください："
        default: return "📋 Please follow these steps:"
        }
    }
    
    private var nextStepsText: String {
        switch currentLocale {
        case "ko": return "Summar 플러그인이 성공적으로 설치되었습니다!"
        case "ja": return "Summarプラグインが正常にインストールされました！"
        default: return "Summar plugin has been successfully installed!"
        }
    }
    
    private var step1Text: String {
        switch currentLocale {
        case "ko": return "1️⃣ 설치한 vault들을 재시작하거나 Obsidian 메뉴에서 'View → Force Reload'를 실행하여 reload하세요."
        case "ja": return "1️⃣ インストールしたvaultを再起動するか、Obsidianメニューの「View → Force Reload」を実行してreloadしてください。"
        default: return "1️⃣ Restart the installed vault(s) or execute 'View → Force Reload' from the Obsidian menu to reload."
        }
    }
    
    private var step2Text: String {
        switch currentLocale {
        case "ko": return "2️⃣ 만약 '보관함의 작성자를 신뢰하시나요?' 알림창이 나타나면 '신뢰' 버튼을 클릭하세요."
        case "ja": return "2️⃣ もし「保管庫の作成者を信頼しますか？」という警告が表示されたら、「信頼」ボタンをクリックしてください。"
        default: return "2️⃣ If a 'Do you trust the author of this vault?' alert appears, click the 'Trust' button."
        }
    }
    
    private var step3Text: String {
        switch currentLocale {
        case "ko": return "✅ 플러그인이 자동으로 활성화되고 바로 사용 가능합니다!"
        case "ja": return "✅ プラグインが自動的に有効化され、すぐに使用可能です！"
        default: return "✅ The plugin is automatically activated and ready to use!"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("🧊 Summar Installer (\(pluginVersion))")
                .font(.title)
                .bold()

            if vaults.isEmpty {
                Button(searchButtonText) {
                    vaults = PluginManager.findObsidianVaults()
                }
            } else {
                Text(selectVaultsText)
                List(vaults, id: \.self, selection: $selectedVaults) {
                    Text($0.path)
                }
                .frame(height: 200)
            }

            Button(isInstalling ? installingText : installButtonText) {
                install()
            }
            .disabled(isInstalling || selectedVaults.isEmpty)
            .padding(.top, 8)

            if !logMessages.isEmpty {
                Text(logText)
                    .font(.headline)
                ScrollView {
                    ForEach(logMessages, id: \.self) { log in
                        Text(log).font(.caption).padding(.bottom, 2)
                    }
                }
                .frame(height: 160)
            }

            if installComplete {
                VStack(alignment: .leading, spacing: 8) {
                    Text(installCompleteText)
                        .font(.title2)
                        .foregroundColor(.green)
                        .padding(.top, 10)
                    
                    Text(nextStepsText)
                        .font(.headline)
                        .foregroundColor(.blue)
                    
                    // 설치된 vault 목록 표시
                    if !installedVaultNames.isEmpty {
                        let vaultListText = currentLocale == "ko" ? "설치된 vault:" : 
                                          currentLocale == "ja" ? "インストールされたvault:" : 
                                          "Installed vaults:"
                        Text(vaultListText)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.top, 4)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(installedVaultNames, id: \.self) { vaultName in
                                Text("• \(vaultName)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.leading, 10)
                    }
                    
                    Text(vaultsReloadedText)
                        .font(.subheadline)
                        .foregroundColor(.orange)
                        .padding(.top, 8)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(step1Text)
                        Text(step2Text)
                        Text(step3Text)
                    }
                    .font(.caption)
                    .padding(.leading, 10)
                }
            }
        }
        .onAppear {
            // 로케일 설정
            currentLocale = detectLocale()
            
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
                    // 설치된 vault 이름들 저장
                    installedVaultNames = Array(selectedVaults).map { $0.lastPathComponent }
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
