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
        .commands {
            // 탭 관련 메뉴 제거
            CommandGroup(replacing: .newItem) {
                EmptyView()
            }
            CommandGroup(replacing: .windowArrangement) {
                EmptyView()
            }
        }
    }
}


class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 메뉴에서 탭 관련 항목 제거
        removeUnnecessaryMenuItems()
        
        // 창 생성 시점이 명확하지 않으므로 delay 사용
        let workItem = DispatchWorkItem {
            if let mainWindow = NSApplication.shared.windows.first {
                self.window = mainWindow
                mainWindow.delegate = self
                
                // 탭 기능 완전 비활성화
                mainWindow.tabbingMode = .disallowed
                
                // 윈도우 타이틀바 스타일 설정 (탭바 제거 효과)
                mainWindow.titlebarAppearsTransparent = false
                mainWindow.titleVisibility = .visible
                
                // 전역 탭 설정 비활성화
                NSWindow.allowsAutomaticWindowTabbing = false
            } else {
                print("❌ No window found")
            }
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: workItem)
    }
    
    func removeUnnecessaryMenuItems() {
        guard let mainMenu = NSApp.mainMenu else { return }
        
        // 모든 메뉴 항목 검색하여 탭 관련 항목 제거
        for menuItem in mainMenu.items {
            if let submenu = menuItem.submenu {
                removeTabRelatedMenuItems(from: submenu)
            }
        }
        
        // 단축키도 비활성화
        disableTabRelatedShortcuts()
    }
    
    func removeTabRelatedMenuItems(from menu: NSMenu) {
        let itemsToRemove = menu.items.filter { menuItem in
            let title = menuItem.title.lowercased()
            return title.contains("new window") ||
                   title.contains("show all tabs") ||
                   title.contains("hide tab bar") ||
                   title.contains("tab") ||
                   title.contains("merge all windows")
        }
        
        for item in itemsToRemove {
            menu.removeItem(item)
        }
        
        // 서브메뉴도 재귀적으로 처리
        for menuItem in menu.items {
            if let submenu = menuItem.submenu {
                removeTabRelatedMenuItems(from: submenu)
            }
        }
    }
    
    func disableTabRelatedShortcuts() {
        // 탭 관련 단축키 비활성화
        _ = ["cmd+t", "cmd+shift+t", "cmd+w", "cmd+`"]
        // 실제 구현은 필요에 따라 추가
    }
}

extension AppDelegate: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        print("🛑 Main window closed — exiting app.")
        NSApp.terminate(nil)
    }
}
