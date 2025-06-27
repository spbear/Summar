class I18n {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.fallbackLanguage = 'en';
    }

    async init() {
        // 시스템 언어 감지
        const systemLang = await this.detectSystemLanguage();
        await this.loadLanguage(systemLang);
    }

    async detectSystemLanguage() {
        let lang;
        
        // Electron 환경에서는 electronAPI를 통해 시스템 로케일 가져오기
        if (window.electronAPI) {
            try {
                const localeInfo = await window.electronAPI.getSystemLocale();
                
                // 환경 변수 우선 체크 (LANG=en_US.UTF-8 등)
                if (localeInfo.env) {
                    const match = localeInfo.env.match(/^([a-z]{2})/i);
                    if (match) {
                        lang = match[1].toLowerCase();
                    }
                }
                
                // 환경 변수가 없으면 앱 로케일 사용
                if (!lang && localeInfo.app) {
                    lang = localeInfo.app.split('-')[0].toLowerCase();
                }
            } catch (error) {
                console.warn('Failed to get system locale:', error);
            }
        } else {
            // 브라우저 환경에서는 navigator 사용
            const navLang = navigator.language || navigator.userLanguage;
            if (navLang) {
                lang = navLang.split('-')[0].toLowerCase();
            }
        }
        
        // 기본값 설정
        if (!lang) {
            lang = 'en';
        }
        
        // 지원하는 언어 목록
        const supportedLanguages = ['en', 'ko', 'ja'];
        
        if (supportedLanguages.includes(lang)) {
            return lang;
        }
        
        return this.fallbackLanguage;
    }

    async loadLanguage(langCode) {
        try {
            // Electron 환경에서는 electronAPI를 통해 로컬 파일 로딩
            if (window.electronAPI) {
                const result = await window.electronAPI.loadLocale(langCode);
                if (result.success) {
                    this.translations = result.data;
                    this.currentLanguage = langCode;
                    console.log(`Loaded language: ${langCode}`);
                    return;
                }
                throw new Error(result.error);
            } else {
                // 브라우저 환경에서는 fetch 사용
                const response = await fetch(`locales/${langCode}.json`);
                if (!response.ok) {
                    throw new Error(`Failed to load language file: ${langCode}`);
                }
                
                this.translations = await response.json();
                this.currentLanguage = langCode;
                console.log(`Loaded language: ${langCode}`);
            }
        } catch (error) {
            console.warn(`Failed to load language ${langCode}, falling back to ${this.fallbackLanguage}`);
            
            if (langCode !== this.fallbackLanguage) {
                await this.loadLanguage(this.fallbackLanguage);
            }
        }
    }

    t(key, variables = {}) {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                console.warn(`Translation key not found: ${key}`);
                return key; // 키를 그대로 반환
            }
        }
        
        if (typeof value === 'string') {
            // 변수 치환 ({{variable}} 형태)
            return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
                return variables[varName] || match;
            });
        }
        
        return value;
    }

    // 배열 형태의 번역 처리
    tArray(key) {
        const value = this.t(key);
        return Array.isArray(value) ? value : [value];
    }

    // HTML 요소의 텍스트 업데이트
    updateElement(element, key, variables = {}) {
        if (element) {
            element.textContent = this.t(key, variables);
        }
    }

    // HTML 요소의 innerHTML 업데이트 (HTML 태그 포함)
    updateElementHTML(element, key, variables = {}) {
        if (element) {
            element.innerHTML = this.t(key, variables);
        }
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// 전역 인스턴스 생성
window.i18n = new I18n();
