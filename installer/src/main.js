const { app, BrowserWindow, ipcMain, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    resizable: false,
    maximizable: false,
    movable: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png') // 아이콘 경로 수정
  });

  mainWindow.loadFile('src/index.html');

  // 창 닫기 이벤트 처리 - X 버튼을 누르면 앱 완전 종료
  mainWindow.on('close', () => {
    app.quit();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // 앱 아이콘 설정 (Dock 아이콘용)
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    console.log('Setting icon path:', iconPath);
    app.dock.setIcon(iconPath);
  }
  
  createWindow();
  
  // macOS에서 전체 디스크 접근 권한 요청
  if (process.platform === 'darwin') {
    requestFullDiskAccess();
  }
});

// 전체 디스크 접근 권한 요청
function requestFullDiskAccess() {
  try {
    // macOS에서만 권한 확인
    if (process.platform !== 'darwin') return;
    
    // 간단한 권한 테스트
    const testPath = path.join(os.homedir(), 'Library');
    require('fs').accessSync(testPath, require('fs').constants.R_OK);
  } catch (error) {
    // 권한이 없는 경우 사용자에게 안내
    setTimeout(() => {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Disk Access Permission',
          message: 'For better vault detection, please grant Full Disk Access permission.',
          detail: 'Go to System Preferences → Security & Privacy → Privacy → Full Disk Access and add this application.',
          buttons: ['OK', 'Open System Preferences'],
          defaultId: 0
        }).then((result) => {
          if (result.response === 1) {
            // 시스템 환경설정 열기
            require('child_process').exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"');
          }
        });
      }
    }, 2000); // 앱이 완전히 로드된 후 표시
  }
}

app.on('window-all-closed', () => {
  // 설치 프로그램이므로 모든 플랫폼에서 창을 닫으면 완전히 종료
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Obsidian vault 탐지 함수 (Obsidian 설정 파일에서 직접 가져오기)
async function findObsidianVaults() {
  const homeDir = os.homedir();
  const vaults = [];
  
  try {
    // Obsidian 설정 파일에서 vault 목록 가져오기
    const obsidianConfigPath = path.join(homeDir, 'Library/Application Support/obsidian/obsidian.json');
    
    console.log(`Obsidian 설정 파일 경로: ${obsidianConfigPath}`);
    
    try {
      const configContent = await fs.readFile(obsidianConfigPath, 'utf8');
      console.log('Obsidian 설정 파일 읽기 성공');
      const config = JSON.parse(configContent);
      console.log('설정 파일 JSON 파싱 성공:', Object.keys(config));
      
      if (config.vaults) {
        console.log('📁 Obsidian 설정에서 vault 목록을 가져왔습니다');
        
        for (const [id, vaultInfo] of Object.entries(config.vaults)) {
          const vaultPath = vaultInfo.path;
          const vaultName = path.basename(vaultPath);
          
          // vault가 실제로 존재하는지 확인
          try {
            const obsidianPath = path.join(vaultPath, '.obsidian');
            await fs.access(obsidianPath);
            
            vaults.push({
              name: vaultName,
              path: vaultPath,
              id: id,
              lastAccess: vaultInfo.ts || 0,
              isOpen: vaultInfo.open || false
            });
            
            console.log(`✅ Vault 발견: ${vaultName} (${vaultPath})`);
          } catch {
            console.log(`⚠️  Vault 경로 접근 불가: ${vaultPath}`);
          }
        }
      }
    } catch (configError) {
      console.log('⚠️  Obsidian 설정 파일 읽기 실패:', configError.message);
      console.log('폴백 검색을 수행합니다.');
      
      // 설정 파일이 없는 경우 최소한의 폴백 검색
      const fallbackPaths = [
        path.join(homeDir, 'Library/Mobile Documents/iCloud~md~obsidian/Documents'),
        path.join(homeDir, 'Documents')
      ];
      
      for (const searchPath of fallbackPaths) {
        try {
          console.log(`폴백 검색 시도: ${searchPath}`);
          await searchForVaults(searchPath, vaults, 1); // 최소 깊이로만 검색
        } catch (error) {
          console.log(`폴백 검색 실패: ${searchPath} - ${error.message}`);
        }
      }
    }
    
    // 중복 제거 (경로 기준)
    const uniqueVaults = removeDuplicateVaults(vaults);
    
    // Obsidian 설정의 접근 시간과 마크다운 파일 수정 시간을 모두 고려하여 정렬
    const sortedVaults = await sortVaultsByActivity(uniqueVaults);
    
    console.log(`${sortedVaults.length}개의 vault 발견 (Obsidian 설정 기반)`);
    return sortedVaults;
    
  } catch (error) {
    console.error('Vault 검색 중 오류:', error);
    return [];
  }
}

// 중복 vault 제거 함수
function removeDuplicateVaults(vaults) {
  const seen = new Set();
  return vaults.filter(vault => {
    // 경로를 정규화하여 중복 확인
    const normalizedPath = path.resolve(vault.path);
    if (seen.has(normalizedPath)) {
      console.log(`중복 vault 제거: ${vault.path}`);
      return false;
    }
    seen.add(normalizedPath);
    return true;
  });
}

// Obsidian 설정과 마크다운 파일 활동을 모두 고려한 정렬
async function sortVaultsByActivity(vaults) {
  const vaultsWithActivity = await Promise.all(
    vaults.map(async (vault) => {
      try {
        // 마크다운 파일 기반 최근 활동 시간
        const markdownActivity = await getVaultLastActivity(vault.path);
        
        // Obsidian 설정의 마지막 접근 시간
        const obsidianLastAccess = vault.lastAccess || 0;
        
        // 두 시간 중 더 최근 시간을 사용
        const combinedTime = Math.max(markdownActivity.time, obsidianLastAccess);
        
        return {
          ...vault,
          lastActivity: markdownActivity,
          lastActivityTime: combinedTime,
          obsidianLastAccess: obsidianLastAccess,
          isCurrentlyOpen: vault.isOpen || false
        };
      } catch (error) {
        console.log(`${vault.name} 활동 시간 확인 실패:`, error.message);
        return {
          ...vault,
          lastActivity: { file: 'unknown', time: vault.lastAccess || 0 },
          lastActivityTime: vault.lastAccess || 0,
          obsidianLastAccess: vault.lastAccess || 0,
          isCurrentlyOpen: vault.isOpen || false
        };
      }
    })
  );

  // 정렬 우선순위: 1) 현재 열린 vault, 2) 최근 활동 시간
  return vaultsWithActivity.sort((a, b) => {
    if (a.isCurrentlyOpen && !b.isCurrentlyOpen) return -1;
    if (!a.isCurrentlyOpen && b.isCurrentlyOpen) return 1;
    return b.lastActivityTime - a.lastActivityTime;
  });
}

// vault 내 최근 활동 시간 조회 (마크다운 파일만 기준)
async function getVaultLastActivity(vaultPath) {
  try {
    let latestTime = 0;
    let latestFile = '';
    
    // 마크다운 파일들만 확인하여 최근 활동 감지
    await findRecentMarkdownFiles(vaultPath, (file, mtime) => {
      if (mtime > latestTime) {
        latestTime = mtime;
        latestFile = file;
      }
    });
    
    // 마크다운 파일이 없는 경우 vault 자체의 생성 시간 사용
    if (latestTime === 0) {
      try {
        const vaultStats = await fs.stat(vaultPath);
        latestTime = vaultStats.mtime.getTime();
        latestFile = 'vault created';
      } catch {
        latestTime = 0;
        latestFile = 'no files';
      }
    }
    
    return {
      file: latestFile,
      time: latestTime
    };
  } catch (error) {
    throw new Error(`Failed to get vault activity: ${error.message}`);
  }
}

// 최근 마크다운 파일 찾기 (재귀적, 깊이 제한)
async function findRecentMarkdownFiles(dirPath, callback, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // .obsidian과 기타 숨김 폴더 제외
      if (entry.name.startsWith('.')) continue;
      
      // 시스템 폴더 제외
      const skipFolders = ['node_modules', '__pycache__', '.git', '.vscode', 'assets'];
      if (skipFolders.includes(entry.name)) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const stats = await fs.stat(fullPath);
          const mtime = stats.mtime.getTime();
          
          // 파일명에서 .md 확장자 제거하여 표시
          const displayName = entry.name.replace(/\.md$/, '');
          callback(displayName, mtime);
          
          console.log(`MD 파일 발견: ${entry.name} (${new Date(mtime).toLocaleDateString()})`);
        } catch {
          // 파일 접근 실패 시 무시
        }
      } else if (entry.isDirectory() && currentDepth < maxDepth - 1) {
        // 하위 디렉토리 검색 (제한된 깊이)
        await findRecentMarkdownFiles(fullPath, callback, maxDepth, currentDepth + 1);
      }
    }
  } catch (error) {
    // 디렉토리 접근 실패 시 무시
    console.log(`디렉토리 접근 실패: ${dirPath}`);
  }
}

async function searchForVaults(dirPath, vaults, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;

  try {
    // 디렉토리 접근 가능성 확인
    await fs.access(dirPath, fs.constants.R_OK);
    
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dirPath, entry.name);
        
        // 시스템/숨김 폴더 제외 (성능 최적화)
        if (entry.name.startsWith('.') && 
            !entry.name.startsWith('.obsidian') && 
            entry.name !== '.obsidian') {
          continue;
        }
        
        // 권한 요청을 최소화하기 위해 더 많은 시스템 폴더 제외
        const skipFolders = [
          'node_modules', 'Library', 'Applications', 'System', 
          '.Trash', '.git', '__pycache__', '.vscode',
          // macOS 시스템 폴더들 (권한 요청 방지)
          'Pictures', 'Movies', 'Music', 'Downloads',
          // 클라우드 서비스 폴더들 (너무 깊숙이 들어가지 않음)
          '.dropbox', '.icloud', 'Caches', 'Logs',
          // 개발 관련 폴더들
          '.npm', '.yarn', '.gradle', '.m2'
        ];
        if (skipFolders.includes(entry.name)) {
          continue;
        }
        
        // .obsidian 폴더가 있으면 vault로 간주
        try {
          const obsidianPath = path.join(fullPath, '.obsidian');
          const stat = await fs.stat(obsidianPath);
          if (stat.isDirectory()) {
            vaults.push({
              name: entry.name,
              path: fullPath
            });
            console.log(`Vault 발견: ${fullPath}`);
            continue; // vault를 찾았으면 하위 디렉토리는 검색하지 않음
          }
        } catch {
          // .obsidian 폴더가 없으면 하위 디렉토리 검색
          // 단, 너무 깊이 들어가지 않도록 제한
          if (currentDepth < maxDepth - 1) {
            await searchForVaults(fullPath, vaults, maxDepth, currentDepth + 1);
          }
        }
      }
    }
  } catch (error) {
    // 접근 권한 오류는 조용히 처리
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.log(`검색 오류 (${dirPath}):`, error.message);
    }
  }
}

// IPC 핸들러들
ipcMain.handle('check-disk-access', async () => {
  if (process.platform !== 'darwin') {
    return { hasAccess: true }; // macOS가 아니면 권한 문제 없음
  }
  
  try {
    // 시스템 디렉토리 접근 테스트로 권한 확인
    const testPath = path.join(os.homedir(), 'Library');
    await fs.access(testPath, fs.constants.R_OK);
    return { hasAccess: true };
  } catch {
    return { 
      hasAccess: false,
      message: 'Full Disk Access permission is required for better vault detection.'
    };
  }
});

ipcMain.handle('open-system-preferences', async () => {
  if (process.platform === 'darwin') {
    require('child_process').exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"');
  }
});

ipcMain.handle('find-vaults', async () => {
  try {
    const vaults = await findObsidianVaults();
    return { success: true, vaults };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-vault-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Obsidian Vault 폴더 선택',
      properties: ['openDirectory'],
      message: 'Obsidian vault 폴더를 선택해주세요'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const vaultPath = result.filePaths[0];
      const vaultName = path.basename(vaultPath);
      
      // .obsidian 폴더 존재 여부 확인
      try {
        const obsidianPath = path.join(vaultPath, '.obsidian');
        await fs.access(obsidianPath);
        return { 
          success: true, 
          vault: { name: vaultName, path: vaultPath } 
        };
      } catch {
        return { 
          success: false, 
          error: '선택된 폴더가 유효한 Obsidian vault가 아닙니다. (.obsidian 폴더를 찾을 수 없음)' 
        };
      }
    }

    return { success: false, error: '폴더가 선택되지 않았습니다.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-plugin', async (event, vaultPath) => {
  try {
    const pluginsDir = path.join(vaultPath, '.obsidian', 'plugins', 'summar');
    const pluginZipPath = path.join(__dirname, '..', 'plugin', 'summar.zip');
    
    // 플러그인 디렉토리 생성
    await fs.mkdir(pluginsDir, { recursive: true });
    
    // ZIP 파일 압축 해제
    const zip = new AdmZip(pluginZipPath);
    zip.extractAllTo(pluginsDir, true);
    
    // community-plugins.json 업데이트
    const communityPluginsPath = path.join(vaultPath, '.obsidian', 'community-plugins.json');
    let communityPlugins = [];
    
    try {
      const content = await fs.readFile(communityPluginsPath, 'utf8');
      communityPlugins = JSON.parse(content);
    } catch {
      // 파일이 없으면 빈 배열로 시작
    }
    
    if (!communityPlugins.includes('summar')) {
      communityPlugins.push('summar');
      await fs.writeFile(communityPluginsPath, JSON.stringify(communityPlugins, null, 2));
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', async () => {
  try {
    // 1. 먼저 플러그인 zip 파일에서 manifest.json을 읽어서 버전 정보 가져오기
    const pluginZipPath = path.join(__dirname, '..', 'plugin', 'summar.zip');
    
    try {
      const zip = new AdmZip(pluginZipPath);
      const manifestEntry = zip.getEntry('manifest.json');
      
      if (manifestEntry) {
        const manifestContent = manifestEntry.getData().toString('utf8');
        const manifest = JSON.parse(manifestContent);
        if (manifest.version) {
          return manifest.version;
        }
      }
    } catch (zipError) {
      console.warn('Failed to read plugin zip:', zipError);
    }
    
    // 2. 플러그인 zip에서 버전을 가져올 수 없다면 installer의 package.json 버전 사용
    // (빌드 시 플러그인 버전과 동기화됨)
    return app.getVersion();
    
  } catch (error) {
    console.error('Error getting version:', error);
    return app.getVersion();
  }
});

// 다국어 파일 로딩 핸들러 추가
ipcMain.handle('load-locale', async (event, language) => {
  try {
    const localePath = path.join(__dirname, 'locales', `${language}.json`);
    const content = await fs.readFile(localePath, 'utf8');
    return { success: true, data: JSON.parse(content) };
  } catch (error) {
    console.log(`Failed to load locale ${language}:`, error.message);
    return { success: false, error: error.message };
  }
});

// 시스템 언어 감지 핸들러 추가
ipcMain.handle('get-system-locale', async (event) => {
  try {
    // 환경 변수에서 언어 정보 추출
    const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES;
    
    // Electron의 app.getLocale()도 사용 가능
    const appLocale = app.getLocale();
    
    return {
      env: envLang,
      app: appLocale
    };
  } catch (error) {
    console.log('Failed to get system locale:', error.message);
    return { env: null, app: 'en' };
  }
});
