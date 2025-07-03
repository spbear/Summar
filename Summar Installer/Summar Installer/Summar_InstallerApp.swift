//
//  Summar_InstallerApp.swift
//  Summar Installer
//
//  Created by  Snow Kwon on 7/2/25.
//

import SwiftUI

@main
struct Summar_InstallerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}


class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 창 생성 시점이 명확하지 않으므로 delay 사용
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            if let mainWindow = NSApplication.shared.windows.first {
                self.window = mainWindow
                mainWindow.delegate = self
            } else {
                print("❌ No window found")
            }
        }
    }
}

extension AppDelegate: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        print("🛑 Main window closed — exiting app.")
        NSApp.terminate(nil)
    }
}
