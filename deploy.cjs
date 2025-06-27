#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

class ObsidianDeployer {
    constructor() {
        this.homeDir = os.homedir();
        this.vaults = [];
        this.pluginId = 'summar';
        this.distDir = path.join(__dirname, 'dist');
    }

    // Obsidian vault 경로들을 탐지
    findObsidianVaults() {
        console.log('🔍 Searching for Obsidian vaults...\n');
        
        const possiblePaths = [
            path.join(this.homeDir, 'Obsidian'),
            path.join(this.homeDir, 'Documents', 'Obsidian'),
            path.join(this.homeDir, 'iCloud Drive (Archive)', 'Obsidian'),
            path.join(this.homeDir, 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents'),
            path.join(this.homeDir, 'Desktop'),
            this.homeDir
        ];

        for (const basePath of possiblePaths) {
            if (fs.existsSync(basePath)) {
                this.scanForVaults(basePath);
            }
        }

        // 중복 제거
        this.vaults = [...new Set(this.vaults)];
        
        console.log(`📁 Found ${this.vaults.length} Obsidian vault(s):\n`);
        this.vaults.forEach((vault, index) => {
            console.log(`${index + 1}. ${vault}`);
        });
        console.log();
    }

    // 재귀적으로 .obsidian 폴더를 찾아서 vault 탐지
    scanForVaults(dir, depth = 0) {
        if (depth > 3) return; // 너무 깊이 들어가지 않도록 제한

        try {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                
                if (item === '.obsidian' && fs.statSync(fullPath).isDirectory()) {
                    // .obsidian 폴더를 찾았으면 그 부모가 vault
                    this.vaults.push(dir);
                } else if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                    // 숨겨진 폴더나 node_modules는 제외하고 재귀 탐색
                    this.scanForVaults(fullPath, depth + 1);
                }
            }
        } catch (error) {
            // 권한 없는 폴더 등은 무시
        }
    }

    // 사용자에게 vault 선택 받기
    async selectVault() {
        if (this.vaults.length === 0) {
            console.log('❌ No Obsidian vaults found!');
            console.log('Make sure you have at least one Obsidian vault with .obsidian folder.');
            process.exit(1);
        }

        if (this.vaults.length === 1) {
            console.log(`✅ Using the only vault found: ${this.vaults[0]}\n`);
            return this.vaults[0];
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('🎯 Select a vault (enter number): ', (answer) => {
                rl.close();
                
                const choice = parseInt(answer) - 1;
                if (choice >= 0 && choice < this.vaults.length) {
                    console.log(`✅ Selected: ${this.vaults[choice]}\n`);
                    resolve(this.vaults[choice]);
                } else {
                    console.log('❌ Invalid selection. Exiting...');
                    process.exit(1);
                }
            });
        });
    }

    // 플러그인 설치
    async installPlugin(vaultPath) {
        const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', this.pluginId);
        
        console.log(`📦 Installing plugin to: ${pluginDir}`);

        // 플러그인 디렉토리 생성
        if (!fs.existsSync(pluginDir)) {
            fs.mkdirSync(pluginDir, { recursive: true });
            console.log('📁 Created plugin directory');
        }

        // dist 폴더의 모든 파일 복사 (zip 파일 제외)
        const distFiles = fs.readdirSync(this.distDir);
        const filesToCopy = distFiles.filter(file => file !== 'summar.zip');

        console.log('\n📋 Copying files:');
        for (const file of filesToCopy) {
            const srcPath = path.join(this.distDir, file);
            const destPath = path.join(pluginDir, file);
            
            fs.copyFileSync(srcPath, destPath);
            console.log(`   ✅ ${file}`);
        }

        console.log(`\n🎉 Plugin successfully installed to vault: ${path.basename(vaultPath)}`);
        console.log(`📂 Location: ${pluginDir}`);
        console.log('\n💡 Don\'t forget to enable the plugin in Obsidian settings!');
    }

    // 메인 실행 함수
    async deploy() {
        console.log('🚀 Obsidian Plugin Deployer\n');
        console.log('============================\n');

        // dist 폴더 확인
        if (!fs.existsSync(this.distDir)) {
            console.log('❌ dist folder not found. Please run "npm run build" first.');
            process.exit(1);
        }

        // vault 탐지
        this.findObsidianVaults();
        
        // vault 선택
        const selectedVault = await this.selectVault();
        
        // 플러그인 설치
        await this.installPlugin(selectedVault);
    }
}

// 스크립트 실행
if (require.main === module) {
    const deployer = new ObsidianDeployer();
    deployer.deploy().catch(console.error);
}

module.exports = ObsidianDeployer;
