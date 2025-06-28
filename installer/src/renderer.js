let currentStep = 1;
let selectedVaults = []; // 배열로 변경
let detectedVaults = [];

// DOM 요소들
const step1Content = document.getElementById('content-step1');
const step2Content = document.getElementById('content-step2');
const step3Content = document.getElementById('content-step3');
const detectedVaultsEl = document.getElementById('detected-vaults');
const selectedVaultsEl = document.getElementById('selected-vaults');
const selectedVaultListEl = document.getElementById('selected-vault-list');
const selectedCountEl = document.getElementById('selected-count');
const selectAllBtn = document.getElementById('select-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const nextStep1Btn = document.getElementById('next-step1');
const selectFolderBtn = document.getElementById('select-folder-btn');
const backStep2Btn = document.getElementById('back-step2');
const installBtn = document.getElementById('install-btn');
const nextStep2Btn = document.getElementById('next-step2');
const finishBtn = document.getElementById('finish-btn');
const grantPermissionBtn = document.getElementById('grant-permission-btn');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await initializeI18n();
    await loadAppVersion();
    await checkDiskAccess();
    await findVaults();
    setupEventListeners();
});

async function checkDiskAccess() {
    try {
        const result = await window.electronAPI.checkDiskAccess();
        
        if (!result.hasAccess) {
            const permissionNotice = document.getElementById('permission-notice');
            if (permissionNotice) {
                permissionNotice.style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('Failed to check disk access:', error);
    }
}

async function initializeI18n() {
    try {
        await window.i18n.init();
        updateAllTexts();
        console.log('i18n initialized with language:', window.i18n.getCurrentLanguage());
    } catch (error) {
        console.error('Failed to initialize i18n:', error);
    }
}

function updateAllTexts() {
    // data-i18n 속성을 가진 모든 요소 업데이트
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const variables = element.getAttribute('data-i18n-vars');
        
        let vars = {};
        if (variables) {
            try {
                vars = JSON.parse(variables);
            } catch (e) {
                console.warn('Invalid JSON in data-i18n-vars:', variables);
            }
        }
        
        window.i18n.updateElement(element, key, vars);
    });
    
    // 동적 콘텐츠 업데이트
    updateNextStepsList();
}

async function loadAppVersion() {
    try {
        const version = await window.electronAPI.getAppVersion();
        const versionEl = document.getElementById('app-version');
        window.i18n.updateElement(versionEl, 'app.version', { version });
    } catch (error) {
        console.error('Failed to load app version:', error);
    }
}

async function findVaults() {
    try {
        const result = await window.electronAPI.findVaults();
        
        if (result.success) {
            detectedVaults = result.vaults;
            displayDetectedVaults();
        } else {
            showError(window.i18n.t('errors.vaultSearchError', { error: result.error }));
        }
    } catch (error) {
        showError(window.i18n.t('errors.vaultSearchError', { error: error.message }));
    }
}

function displayDetectedVaults() {
    detectedVaultsEl.innerHTML = '';
    
    if (detectedVaults.length === 0) {
        detectedVaultsEl.innerHTML = `
            <div class="loading">
                ${window.i18n.t('vault.noVaultsFound')}
            </div>
        `;
        return;
    }

    detectedVaults.forEach((vault, index) => {
        const vaultEl = document.createElement('div');
        vaultEl.className = 'vault-item';
        vaultEl.dataset.vaultIndex = index;
        
        // 현재 열린 vault인지 확인
        const isOpen = vault.isCurrentlyOpen;
        
        // 최근 활동이 7일 이내인 경우 배지 표시
        const isRecent = vault.lastActivityTime && 
                        (Date.now() - vault.lastActivityTime) < (7 * 24 * 60 * 60 * 1000);
        
        const openBadge = isOpen ? `<div class="open-badge">${window.i18n.t('vault.openBadge')}</div>` : '';
        const recentBadge = isRecent && !isOpen ? `<div class="recent-badge">${window.i18n.t('vault.recentBadge')}</div>` : '';
        const activityInfo = vault.lastActivity ? formatVaultActivity(vault.lastActivity) : '';
        
        vaultEl.innerHTML = `
            <div class="vault-info">
                <div class="vault-main-info">
                    <span class="vault-name">
                        ${vault.name}
                        ${isRecent && !isOpen ? `<span class="recent-badge">${window.i18n.t('vault.recentBadge')}</span>` : ''}
                        ${isOpen ? `<span class="open-badge">${window.i18n.t('vault.openBadge')}</span>` : ''}
                    </span>
                    <span class="vault-path">${vault.path}</span>
                    ${activityInfo}
                </div>
            </div>
        `;
        
        // vault 클릭으로 선택/해제
        vaultEl.addEventListener('click', () => toggleVaultSelection(vault, vaultEl));
        
        detectedVaultsEl.appendChild(vaultEl);
    });
}

function formatVaultActivity(activity) {
    if (!activity || !activity.time) {
        return `<div class="vault-activity"><span class="vault-last-file">${window.i18n.t('vault.noMarkdownFiles')}</span></div>`;
    }
    
    const timeAgo = getTimeAgo(activity.time);
    const fileName = activity.file || 'Unknown file';
    
    // 특별한 경우들 처리
    if (fileName === 'vault created') {
        return `
            <div class="vault-activity">
                <span class="vault-last-file">${window.i18n.t('vault.emptyVault')}</span>
                <span class="vault-last-time">${timeAgo}</span>
            </div>
        `;
    }
    
    if (fileName === 'no files') {
        return `<div class="vault-activity"><span class="vault-last-file">${window.i18n.t('vault.noFilesFound')}</span></div>`;
    }
    
    // 마크다운 파일인 경우
    return `
        <div class="vault-activity">
            <span class="vault-last-file">📝 ${fileName}</span>
            <span class="vault-last-time">${timeAgo}</span>
        </div>
    `;
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    
    if (months > 0) return window.i18n.t('time.monthsAgo', { count: months });
    if (weeks > 0) return window.i18n.t('time.weeksAgo', { count: weeks });
    if (days > 0) return window.i18n.t('time.daysAgo', { count: days });
    if (hours > 0) return window.i18n.t('time.hoursAgo', { count: hours });
    if (minutes > 0) return window.i18n.t('time.minutesAgo', { count: minutes });
    return window.i18n.t('time.justNow');
}

function toggleVaultSelection(vault, vaultElement) {
    const isCurrentlySelected = selectedVaults.find(v => v.path === vault.path);
    
    if (isCurrentlySelected) {
        // vault 제거
        selectedVaults = selectedVaults.filter(v => v.path !== vault.path);
        vaultElement.classList.remove('selected');
    } else {
        // vault 추가
        selectedVaults.push(vault);
        vaultElement.classList.add('selected');
    }
    
    updateSelectedVaultsDisplay();
    updateNextButton();
}

function updateSelectedVaultsDisplay() {
    if (selectedVaults.length === 0) {
        selectedVaultsEl.style.display = 'none';
        return;
    }
    
    selectedVaultsEl.style.display = 'block';
    
    // 선택된 개수 업데이트
    selectedCountEl.innerHTML = `<span data-i18n="vault.selectedCount">${window.i18n.t('vault.selectedCount', { count: selectedVaults.length })}</span>`;
    
    // 선택된 vault 목록 표시
    selectedVaultListEl.innerHTML = '';
    selectedVaults.forEach((vault, index) => {
        const vaultEl = document.createElement('div');
        vaultEl.className = 'selected-vault-item';
        vaultEl.innerHTML = `
            <div class="vault-info">
                <span class="vault-name">${vault.name}</span>
                <span class="vault-path">${vault.path}</span>
            </div>
            <button class="remove-vault-btn" data-vault-index="${index}" title="${window.i18n.t('vault.removeButton')}">×</button>
        `;
        
        // 제거 버튼 이벤트
        const removeBtn = vaultEl.querySelector('.remove-vault-btn');
        removeBtn.addEventListener('click', () => {
            removeVaultFromSelection(vault);
        });
        
        selectedVaultListEl.appendChild(vaultEl);
    });
}

function removeVaultFromSelection(vault) {
    selectedVaults = selectedVaults.filter(v => v.path !== vault.path);
    
    // vault 아이템에서 선택 상태 제거
    const vaultIndex = detectedVaults.findIndex(v => v.path === vault.path);
    if (vaultIndex !== -1) {
        const vaultElement = document.querySelector(`[data-vault-index="${vaultIndex}"]`);
        if (vaultElement) {
            vaultElement.classList.remove('selected');
        }
    }
    
    updateSelectedVaultsDisplay();
    updateNextButton();
}

function updateNextButton() {
    nextStep1Btn.disabled = selectedVaults.length === 0;
}

function selectAllVaults() {
    selectedVaults = [...detectedVaults];
    
    // 모든 vault 아이템에 선택 클래스 추가
    document.querySelectorAll('.vault-item').forEach(vaultEl => {
        vaultEl.classList.add('selected');
    });
    
    updateSelectedVaultsDisplay();
    updateNextButton();
}

function clearAllVaults() {
    selectedVaults = [];
    
    // 모든 vault 아이템에서 선택 클래스 제거
    document.querySelectorAll('.vault-item').forEach(vaultEl => {
        vaultEl.classList.remove('selected');
    });
    
    updateSelectedVaultsDisplay();
    updateNextButton();
}

function selectVault(vault) {
    // 레거시 함수 - 이제 사용하지 않음
    console.warn('selectVault function is deprecated, use toggleVaultSelection instead');
}

async function selectFolderManually() {
    try {
        const result = await window.electronAPI.selectVaultFolder();
        
        if (result.success) {
            // 수동으로 선택한 vault를 선택된 목록에 추가
            if (!selectedVaults.find(v => v.path === result.vault.path)) {
                selectedVaults.push(result.vault);
                updateSelectedVaultsDisplay();
                updateNextButton();
            }
        } else {
            showError(result.error);
        }
    } catch (error) {
        showError(window.i18n.t('errors.folderSelectionError', { error: error.message }));
    }
}

function setupEventListeners() {
    selectFolderBtn.addEventListener('click', selectFolderManually);
    selectAllBtn.addEventListener('click', selectAllVaults);
    clearAllBtn.addEventListener('click', clearAllVaults);
    nextStep1Btn.addEventListener('click', () => goToStep(2));
    backStep2Btn.addEventListener('click', () => goToStep(1));
    installBtn.addEventListener('click', installPlugins);
    nextStep2Btn.addEventListener('click', () => goToStep(3));
    finishBtn.addEventListener('click', () => {
        window.close();
    });
    
    if (grantPermissionBtn) {
        grantPermissionBtn.addEventListener('click', async () => {
            try {
                await window.electronAPI.openSystemPreferences();
                
                // 권한 부여 후 다시 검색하도록 안내
                setTimeout(async () => {
                    const result = await window.electronAPI.checkDiskAccess();
                    if (result.hasAccess) {
                        document.getElementById('permission-notice').style.display = 'none';
                        await findVaults();
                    }
                }, 2000);
            } catch (error) {
                console.error('Failed to open system preferences:', error);
            }
        });
    }
}

function goToStep(stepNumber) {
    // 이전 단계 비활성화
    document.querySelectorAll('.step-content').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelectorAll('.step').forEach(el => {
        el.classList.remove('active');
    });

    // 새 단계 활성화
    currentStep = stepNumber;
    document.getElementById(`content-step${stepNumber}`).classList.add('active');
    document.getElementById(`step${stepNumber}`).classList.add('active');
    
    // 완료된 단계 표시
    for (let i = 1; i < stepNumber; i++) {
        document.getElementById(`step${i}`).classList.add('completed');
    }

    // Step 2에서 선택된 vault들 정보 표시
    if (stepNumber === 2 && selectedVaults.length > 0) {
        updateInstallationInfo();
    }
    
    // Step 3으로 이동시 설치 결과 표시
    if (stepNumber === 3) {
        updateCompletionPage();
    }
}

function updateInstallationInfo() {
    const vaultCountEl = document.getElementById('install-vault-count');
    const vaultInstallListEl = document.getElementById('vault-install-list');
    
    vaultCountEl.textContent = `${selectedVaults.length}${window.i18n.getCurrentLanguage() === 'ko' ? '개' : ''}`;
    
    vaultInstallListEl.innerHTML = '';
    selectedVaults.forEach((vault, index) => {
        const vaultEl = document.createElement('div');
        vaultEl.className = 'install-vault-item';
        vaultEl.innerHTML = `
            <div class="vault-info">
                <span class="vault-name">${vault.name}</span>
                <span class="vault-path">${vault.path}</span>
            </div>
            <div class="install-status" id="install-status-${index}">
                <span class="status-text">${window.i18n.t('install.waiting')}</span>
            </div>
        `;
        vaultInstallListEl.appendChild(vaultEl);
    });
}

// 완료 페이지 업데이트 함수
function updateCompletionPage() {
    const results = window.installationResults;
    if (!results) return;
    
    const messageEl = document.getElementById('completion-message-text');
    const summaryEl = document.getElementById('installation-summary');
    
    // 완료 메시지 업데이트
    if (results.success === results.total) {
        messageEl.textContent = window.i18n.t('complete.allSuccess');
        messageEl.style.color = '#28a745';
    } else if (results.success > 0) {
        messageEl.textContent = window.i18n.t('complete.partialSuccess');
        messageEl.style.color = '#ffc107';
    } else {
        messageEl.textContent = window.i18n.t('complete.failed');
        messageEl.style.color = '#dc3545';
    }
    
    // 설치 요약 표시
    summaryEl.innerHTML = `
        <div class="summary-stats">
            <div class="stat-item">
                <span class="stat-number" style="color: #28a745">${results.success}</span>
                <span class="stat-label">${window.i18n.t('complete.success')}</span>
            </div>
            <div class="stat-item">
                <span class="stat-number" style="color: #dc3545">${results.failed}</span>
                <span class="stat-label">${window.i18n.t('complete.error')}</span>
            </div>
            <div class="stat-item">
                <span class="stat-number" style="color: #6c757d">${results.total}</span>
                <span class="stat-label">${window.i18n.t('complete.total')}</span>
            </div>
        </div>
        <div class="vault-summary-list">
            ${results.vaults.map((vault, index) => `
                <div class="vault-summary-item">
                    <span class="vault-name">${vault.name}</span>
                    <span class="vault-result ${index < results.success ? 'success' : 'failed'}">
                        ${index < results.success ? '✅ ' + window.i18n.t('complete.success') : '❌ ' + window.i18n.t('complete.error')}
                    </span>
                </div>
            `).join('')}
        </div>
    `;
}

async function installPlugins() {
    const progressEl = document.getElementById('installation-progress');
    const overallProgressFill = document.getElementById('overall-progress-fill');
    const overallProgressText = document.getElementById('overall-progress-text');
    const vaultProgressListEl = document.getElementById('vault-progress-list');
    
    // UI 업데이트
    installBtn.style.display = 'none';
    progressEl.style.display = 'block';
    
    let successCount = 0;
    let totalVaults = selectedVaults.length;
    
    try {
        overallProgressText.textContent = window.i18n.t('install.preparing');
        
        // 각 vault별 진행바 생성
        vaultProgressListEl.innerHTML = '';
        selectedVaults.forEach((vault, index) => {
            const vaultProgressEl = document.createElement('div');
            vaultProgressEl.className = 'vault-progress-item';
            vaultProgressEl.innerHTML = `
                <div class="vault-progress-info">
                    <span class="vault-name">${vault.name}</span>
                    <span class="vault-status" id="vault-status-${index}">${window.i18n.t('install.waiting')}</span>
                </div>
                <div class="vault-progress-bar">
                    <div class="vault-progress-fill" id="vault-progress-${index}"></div>
                </div>
            `;
            vaultProgressListEl.appendChild(vaultProgressEl);
        });
        
        // 각 vault에 순차적으로 설치
        for (let i = 0; i < selectedVaults.length; i++) {
            const vault = selectedVaults[i];
            const statusEl = document.getElementById(`vault-status-${i}`);
            const progressFillEl = document.getElementById(`vault-progress-${i}`);
            
            try {
                statusEl.textContent = window.i18n.t('install.installing');
                statusEl.className = 'vault-status installing';
                
                // 설치 진행률 애니메이션
                const steps = [
                    { progress: 25, text: window.i18n.t('install.creatingFolderStep') },
                    { progress: 50, text: window.i18n.t('install.copyingFilesStep') },
                    { progress: 75, text: window.i18n.t('install.updatingConfigStep') },
                    { progress: 100, text: window.i18n.t('install.completeStep') }
                ];
                
                for (const step of steps) {
                    progressFillEl.style.width = step.progress + '%';
                    statusEl.textContent = step.text;
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // 실제 설치 수행
                const result = await window.electronAPI.installPlugin(vault.path);
                
                if (result.success) {
                    statusEl.textContent = '✅ ' + window.i18n.t('install.complete');
                    statusEl.className = 'vault-status success';
                    progressFillEl.style.width = '100%';
                    successCount++;
                } else {
                    statusEl.textContent = '❌ ' + window.i18n.t('install.failed');
                    statusEl.className = 'vault-status error';
                    console.error(`Installation failed (${vault.name}):`, result.error);
                }
                
            } catch (error) {
                statusEl.textContent = '❌ ' + window.i18n.t('install.error');
                statusEl.className = 'vault-status error';
                console.error(`Installation error (${vault.name}):`, error);
            }
            
            // 전체 진행률 업데이트
            const overallProgress = Math.round(((i + 1) / totalVaults) * 100);
            overallProgressFill.style.width = overallProgress + '%';
            overallProgressText.textContent = window.i18n.t('install.installingProgress', { current: i + 1, total: totalVaults });
        }
        
        // 완료 메시지
        if (successCount === totalVaults) {
            overallProgressText.textContent = window.i18n.t('install.allComplete', { success: successCount, total: totalVaults });
        } else {
            overallProgressText.textContent = window.i18n.t('install.partialComplete', { success: successCount, total: totalVaults });
        }
        
        // 설치 결과 저장 (완료 페이지에서 사용)
        window.installationResults = {
            total: totalVaults,
            success: successCount,
            failed: totalVaults - successCount,
            vaults: selectedVaults
        };
        
        setTimeout(() => {
            nextStep2Btn.style.display = 'block';
        }, 1000);
        
    } catch (error) {
        showError(window.i18n.t('install.installError', { error: error.message }));
        installBtn.style.display = 'block';
        progressEl.style.display = 'none';
    }
}

function showError(message) {
    alert(window.i18n.t('errors.title') + ': ' + message);
}

function updateNextStepsList() {
    const nextStepsList = document.getElementById('next-steps-list');
    if (nextStepsList) {
        const steps = window.i18n.tArray('complete.steps');
        nextStepsList.innerHTML = '';
        steps.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step;
            nextStepsList.appendChild(li);
        });
    }
}
