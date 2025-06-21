import SummarPlugin from "./main";
import { SummarDebug } from "./globals";

// API 로그 인터페이스
export interface APICallLog {
    id: string;
    timestamp: number;
    timestampISO: string;
    provider: 'openai' | 'gemini' | 'claude';
    model: string;
    endpoint: string;
    feature: string;
    
    requestSize: number;
    responseSize: number;
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
    duration?: number;
    
    cost?: number;
    latency: number;
    success: boolean;
    errorMessage?: string;
    
    sessionId: string;
    userAgent: string;
    version: string;
}

// IndexedDB 관리 클래스
export class IndexedDBManager {
    dbName = `summar-ai-api-logs-db`;
    private dbVersion = 2;
    private db: IDBDatabase | null = null;

    async init(plugin: SummarPlugin): Promise<void> {
        this.dbName = `summar-ai-api-logs-db-${plugin.app.vault.getName()}`;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                
                // API 로그 저장소
                if (!db.objectStoreNames.contains('api_logs')) {
                    const logsStore = db.createObjectStore('api_logs', { keyPath: 'id' });
                    logsStore.createIndex('timestamp', 'timestamp', { unique: false });
                    logsStore.createIndex('provider', 'provider', { unique: false });
                    logsStore.createIndex('feature', 'feature', { unique: false });
                    logsStore.createIndex('success', 'success', { unique: false });
                    logsStore.createIndex('provider_timestamp', ['provider', 'timestamp'], { unique: false });
                }
                
                // 일별 집계 저장소 (성능 최적화용)
                if (!db.objectStoreNames.contains('daily_stats')) {
                    const statsStore = db.createObjectStore('daily_stats', { keyPath: 'id' });
                    statsStore.createIndex('date', 'date', { unique: false });
                    statsStore.createIndex('provider', 'provider', { unique: false });
                    statsStore.createIndex('date_provider', ['date', 'provider'], { unique: true });
                }
                
                // 설정 저장소
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async addLog(log: APICallLog): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs', 'daily_stats'], 'readwrite');
            const logsStore = transaction.objectStore('api_logs');
            const statsStore = transaction.objectStore('daily_stats');
            
            // 로그 추가
            const addRequest = logsStore.add(log);
            
            addRequest.onsuccess = async () => {
                // 일별 통계 업데이트
                await this.updateDailyStats(log, statsStore);
                resolve();
            };
            
            addRequest.onerror = () => reject(addRequest.error);
        });
    }

    private async updateDailyStats(log: APICallLog, statsStore: IDBObjectStore): Promise<void> {
        const date = new Date(log.timestamp).toISOString().split('T')[0];
        const statsId = `${date}-${log.provider}`;
        
        return new Promise((resolve, reject) => {
            const getRequest = statsStore.get(statsId);
            
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                
                let stats;
                if (existing) {
                    stats = {
                        ...existing,
                        totalCalls: existing.totalCalls + 1,
                        totalTokens: existing.totalTokens + (log.totalTokens || 0),
                        totalCost: existing.totalCost + (log.cost || 0),
                        latencySum: existing.latencySum + log.latency,
                        successCount: existing.successCount + (log.success ? 1 : 0),
                        features: { ...existing.features, [log.feature]: (existing.features[log.feature] || 0) + 1 }
                    };
                    stats.avgLatency = stats.latencySum / stats.totalCalls;
                    stats.successRate = (stats.successCount / stats.totalCalls) * 100;
                } else {
                    stats = {
                        id: statsId,
                        date,
                        provider: log.provider,
                        totalCalls: 1,
                        totalTokens: log.totalTokens || 0,
                        totalCost: log.cost || 0,
                        latencySum: log.latency,
                        avgLatency: log.latency,
                        successCount: log.success ? 1 : 0,
                        successRate: log.success ? 100 : 0,
                        features: { [log.feature]: 1 }
                    };
                }
                
                const putRequest = statsStore.put(stats);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async getLogs(options: {
        startDate?: Date,
        endDate?: Date,
        provider?: string,
        feature?: string,
        limit?: number,
        offset?: number
    } = {}): Promise<APICallLog[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs'], 'readonly');
            const store = transaction.objectStore('api_logs');
            
            let request: IDBRequest;
            
            if (options.startDate || options.endDate) {
                const index = store.index('timestamp');
                const range = IDBKeyRange.bound(
                    options.startDate?.getTime() || 0,
                    options.endDate?.getTime() || Date.now()
                );
                request = index.getAll(range);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => {
                let logs = request.result as APICallLog[];
                
                // 필터링
                if (options.provider) {
                    logs = logs.filter(log => log.provider === options.provider);
                }
                if (options.feature) {
                    logs = logs.filter(log => log.feature === options.feature);
                }
                
                // 정렬 (최신순)
                logs.sort((a, b) => b.timestamp - a.timestamp);
                
                // 페이지네이션
                if (options.offset || options.limit) {
                    const start = options.offset || 0;
                    const end = options.limit ? start + options.limit : undefined;
                    logs = logs.slice(start, end);
                }
                
                resolve(logs);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getDailyStats(days: number = 30): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['daily_stats'], 'readonly');
            const store = transaction.objectStore('daily_stats');
            const index = store.index('date');
            
            const endDate = new Date();
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - days);
            
            const range = IDBKeyRange.bound(
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            );
            
            const request = index.getAll(range);
            
            request.onsuccess = () => {
                const stats = request.result;
                
                // 일별로 그룹화
                const dailyData: Record<string, any> = {};
                
                stats.forEach(stat => {
                    if (!dailyData[stat.date]) {
                        dailyData[stat.date] = {
                            period: this.formatDate(new Date(stat.date)),
                            totalCalls: 0,
                            totalTokens: 0,
                            totalCost: 0,
                            avgLatency: 0,
                            successRate: 0,
                            providers: {},
                            features: {}
                        };
                    }
                    
                    const day = dailyData[stat.date];
                    day.totalCalls += stat.totalCalls;
                    day.totalTokens += stat.totalTokens;
                    day.totalCost += stat.totalCost;
                    day.providers[stat.provider] = (day.providers[stat.provider] || 0) + stat.totalCalls;
                    
                    // 기능별 집계
                    Object.entries(stat.features).forEach(([feature, calls]) => {
                        day.features[feature] = (day.features[feature] || 0) + calls;
                    });
                });
                
                // 평균 계산 및 정리
                const result = Object.values(dailyData).map(day => ({
                    ...day,
                    avgLatency: day.totalCalls > 0 ? day.avgLatency / day.totalCalls : 0,
                    successRate: day.totalCalls > 0 ? (day.successRate / day.totalCalls) : 100,
                    topFeatures: Object.entries(day.features)
                        .map(([feature, calls]) => ({ feature, calls: calls as number }))
                        .sort((a, b) => (b.calls as number) - (a.calls as number))
                        .slice(0, 5),
                    providerBreakdown: Object.entries(day.providers)
                        .map(([provider, calls]) => ({
                            provider,
                            calls: calls as number,
                            percentage: ((calls as number) / day.totalCalls) * 100
                        }))
                        .sort((a, b) => (b.calls as number) - (a.calls as number))
                }));
                
                resolve(result.sort((a, b) => a.period.localeCompare(b.period)));
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getStats(): Promise<any> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs'], 'readonly');
            const store = transaction.objectStore('api_logs');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const logs = request.result as APICallLog[];
                
                if (logs.length === 0) {
                    resolve({
                        totalLogs: 0,
                        totalCost: 0,
                        totalTokens: 0,
                        avgLatency: 0,
                        successRate: 100,
                        providers: [],
                        features: [],
                        oldestLog: null,
                        newestLog: null
                    });
                    return;
                }
                
                const totalCost = logs.reduce((sum, log) => sum + (log.cost || 0), 0);
                const totalTokens = logs.reduce((sum, log) => sum + (log.totalTokens || 0), 0);
                const avgLatency = logs.reduce((sum, log) => sum + log.latency, 0) / logs.length;
                const successCount = logs.filter(log => log.success).length;
                const successRate = (successCount / logs.length) * 100;
                
                const providers = [...new Set(logs.map(log => log.provider))];
                const features = [...new Set(logs.map(log => log.feature))];
                
                const timestamps = logs.map(log => log.timestamp);
                const oldestLog = new Date(Math.min(...timestamps));
                const newestLog = new Date(Math.max(...timestamps));
                
                resolve({
                    totalLogs: logs.length,
                    totalCost,
                    totalTokens,
                    avgLatency,
                    successRate,
                    providers,
                    features,
                    oldestLog,
                    newestLog
                });
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async exportData(): Promise<string> {
        const logs = await this.getLogs();
        return JSON.stringify(logs, null, 2);
    }

    async importData(jsonData: string): Promise<number> {
        const logs = JSON.parse(jsonData) as APICallLog[];
        let imported = 0;
        
        for (const log of logs) {
            try {
                await this.addLog(log);
                imported++;
            } catch (error) {
                console.warn('Failed to import log:', log.id, error);
            }
        }
        
        return imported;
    }

    async clearOldLogs(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs'], 'readwrite');
            const store = transaction.objectStore('api_logs');
            const index = store.index('timestamp');
            
            const range = IDBKeyRange.upperBound(cutoffDate.getTime());
            const request = index.openCursor(range);
            
            let deleted = 0;
            
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    cursor.delete();
                    deleted++;
                    cursor.continue();
                } else {
                    resolve(deleted);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    private formatDate(date: Date): string {
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    async deleteIf(predicate: (log: APICallLog) => boolean): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database is not initialized.'));
                return;
            }
            const transaction = this.db.transaction(['api_logs'], 'readwrite');
            const store = transaction.objectStore('api_logs');
            const getAllRequest = store.getAll();
            let deleted = 0;
    
            getAllRequest.onsuccess = () => {
                const logs = getAllRequest.result as APICallLog[];
                const toDelete = logs.filter(predicate);
                if (toDelete.length === 0) {
                    resolve(0);
                    return;
                }
                let processed = 0;
                toDelete.forEach(log => {
                    const deleteRequest = store.delete(log.id);
                    deleteRequest.onsuccess = () => {
                        deleted++;
                        processed++;
                        if (processed === toDelete.length) {
                            resolve(deleted);
                        }
                    };
                    deleteRequest.onerror = () => {
                        processed++;
                        if (processed === toDelete.length) {
                            resolve(deleted);
                        }
                    };
                });
            };
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }
}

// API 클라이언트 (IndexedDB 연동)
export class TrackedAPIClient {
    private dbManager: IndexedDBManager;
    private sessionId: string;
    private startTime: number;
    private plugin: SummarPlugin;

    constructor(plugin: SummarPlugin) {
        this.plugin = plugin;
        this.dbManager = plugin.dbManager;
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        this.startTime = Date.now();
    }

    start() {
        this.startTime = Date.now();
    }
    getLatency() : number {
        return Date.now() - this.startTime;
    }

    async logAPICall(
        provider: string,
        model: string,
        endpoint: string,
        feature: string,
        requestData: any,
        responseData: any,
        success: boolean,
        error?: string,
        duration: number = -1,
    ) {
        let requestSize: number;
        if (requestData instanceof ArrayBuffer) {
            requestSize = requestData.byteLength;
        } else if (requestData instanceof Uint8Array) {
            requestSize = requestData.byteLength;
        } else {
            requestSize = new Blob([JSON.stringify(requestData)]).size;
        }

        const responseSize = responseData ? new Blob([JSON.stringify(responseData)]).size : 0;
        const latency = this.getLatency();
        const now = Date.now();

        const logEntry: APICallLog = {
            id: crypto.randomUUID(),
            timestamp: now,
            timestampISO: new Date(now).toISOString(),
            provider: provider as any,
            model,
            endpoint,
            feature,
            
            requestSize,
            responseSize,
            duration,
            
            latency,
            success,
            errorMessage: error,
            
            sessionId: this.sessionId,
            userAgent: `Obsidian-Summar/${this.plugin.manifest.version}`,
            version: '1.0.0',
            
            ...this.parseUsageData(provider, responseData, model, duration)
        };

        try {
            await this.dbManager.addLog(logEntry);
        } catch (error) {
            console.error('Failed to save log to IndexedDB:', error);
        }
    }

    private parseUsageData(provider: string, responseData: any, model: string = '', duration: number = -1): any {
        if (!responseData) return {};

        if (provider === 'openai') {
            if (responseData.usage && (duration < 0)) {
                return {
                    requestTokens: responseData.usage.prompt_tokens,
                    responseTokens: responseData.usage.completion_tokens,
                    totalTokens: responseData.usage.total_tokens,
                    cost: this.calculateOpenAICost(responseData.model || '', responseData.usage)
                };
            } else {
                return {
                    requestTokens: 0,
                    responseTokens: 0,
                    cost : this.calculateOpenAIAudioTranscriptionCost(model || '', duration) 
                };
            }
        }

        if (provider === 'gemini' && responseData.usageMetadata) {
            return {
                requestTokens: responseData.usageMetadata.promptTokenCount,
                responseTokens: responseData.usageMetadata.candidatesTokenCount,
                totalTokens: responseData.usageMetadata.totalTokenCount,
                cost: this.calculateGeminiCost(responseData.modelVersion, responseData.usageMetadata)
            };
        }

        return {};
    }

    calculateOpenAICost(model: string, usage: any): number {
        // 모델명 정규화
        const m = model.toLowerCase();

        const pricing = this.plugin.modelPricing?.openai ?? {};
        const matchedKey = Object.keys(pricing).find(key => m.includes(key.toLowerCase())) ?? '';
        const price = pricing[matchedKey] ?? { inputPerK: 0, outputPerK: 0 };

        if (m.includes('whisper') || m.includes('transcribe')) return 0;
        return (usage.prompt_tokens * price.inputPerK / 1000) + (usage.completion_tokens * price.outputPerK / 1000);
    }

    calculateOpenAIAudioTranscriptionCost(model: string, duration: number): number {
        const m = model.toLowerCase();
        const pricing = this.plugin.modelPricing?.openai ?? {};
        const matchedKey = Object.keys(pricing).find(key => key.toLowerCase() === m) ?? '';
        const pricePerMinute = pricing[matchedKey]?.inputPerMinute ?? 0;
        // SummarDebug.log(3, `calculateOpenAIAudioTranscriptionCost()\nModel: ${model}, Duration: ${duration}, Price per minute: ${pricePerMinute}, Matched Key: ${matchedKey}`);
        // SummarDebug.log(3, `Pricing: ${JSON.stringify(pricing)}`);

        return (duration / 60) * pricePerMinute;
    }

    calculateGeminiCost(
        modelVersion: string,
        usage: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
        }
    ): number {
        const model = (modelVersion || '').toLowerCase();
        const promptTokens = usage.promptTokenCount || 0;
        const completionTokens = usage.candidatesTokenCount || 0;

        const pricing = this.plugin.modelPricing?.gemini ?? {};
        let inputPerK = 0, outputPerK = 0;

        if (model.includes('2.5-pro')) {
        const tier = promptTokens > 200_000
            ? pricing["gemini-2.5-pro"]?.over200k
            : pricing["gemini-2.5-pro"]?.under200k;
        inputPerK = tier?.inputPerK ?? 0;
        outputPerK = tier?.outputPerK ?? 0;
        } else {
        const matchedKey = Object.keys(pricing).find(key => model.includes(key)) ?? '';
        const tier = pricing[matchedKey] ?? { inputPerK: 0, outputPerK: 0 };
        inputPerK = tier.inputPerK;
        outputPerK = tier.outputPerK;
        }

        return (promptTokens * inputPerK) / 1000 + (completionTokens * outputPerK) / 1000;

    }

    private extractGeminiModel(endpoint: string): string {
        const match = endpoint.match(/models\/([^:\/]+)/);
        return match ? match[1] : 'unknown';
    }

    /**
     * 테스트용 API 로그를 count수 만큼 DB에 랜덤 생성하여 추가합니다.
     * - timestamp: 오늘~일주일 전 랜덤
     * - provider/model: model-pricing.json 기반 랜덤 (openai/gemini 짝 맞춤)
     * - feature: 'stt', 'web', 'custom', 'pdf', 'stt-summary', 'stt-refine' 중 랜덤
     * - requestSize/responseSize: 100~200 랜덤
     * - latency: 1000~4000 랜덤
     * - success: true/false 랜덤, errorMessage는 false일 때만 임의값
     * - sessionId: 10~20자 랜덤 문자열
     * - userAgent/version: logAPICall 참고
     * - requestTokens/responseTokens/totalTokens: 임의값
     * - cost: 0~0.003 랜덤
     */
    
    async logAPICallTest(days: number, count: number) {
        // 모델/프로바이더 목록 준비
        const openaiModels = [
            'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini', 'o3-mini', 'whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'
        ];
        const geminiModels = [
            'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-latest-lite', 'gemini-1.5-lite', 'gemini-1.0-lite'
        ];
        const features = ['stt', 'web', 'custom', 'pdf', 'stt-summary', 'stt-refine'];
        const providers: ('openai' | 'gemini')[] = ['openai', 'gemini'];
        const now = Date.now();
        const oneYear = days * 24 * 60 * 60 * 1000;
        function randomStr(len: number) {
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return s;
        }
        for (let i = 0; i < count; i++) {
            // 날짜 랜덤
            const timestamp = now - Math.floor(Math.random() * oneYear);
            const timestampISO = new Date(timestamp).toISOString();
            // provider/model 짝 랜덤
            const provider: 'openai' | 'gemini' = providers[Math.floor(Math.random() * providers.length)] as 'openai' | 'gemini';
            let model = '';
            if (provider === 'openai') {
                model = openaiModels[Math.floor(Math.random() * openaiModels.length)];
            } else {
                model = geminiModels[Math.floor(Math.random() * geminiModels.length)];
            }
            // feature 랜덤
            const feature = features[Math.floor(Math.random() * features.length)];
            // 기타 값 랜덤
            const requestSize = 100 + Math.floor(Math.random() * 101);
            const responseSize = 100 + Math.floor(Math.random() * 101);
            const latency = 1000 + Math.floor(Math.random() * 3001);
            const success = Math.random() < 0.8; // 성공 80% 확률
            const errorMessage = success ? undefined : 'Error occurred: ' + randomStr(8);
            const sessionId = randomStr(10 + Math.floor(Math.random() * 11));
            const userAgent = `Obsidian-Summar/${this.plugin.manifest?.version ?? '1.0.0'}`;
            const version = '1.0.0';
            const requestTokens = 100 + Math.floor(Math.random() * 100);
            const responseTokens = 100 + Math.floor(Math.random() * 100);
            const totalTokens = requestTokens + responseTokens;
            const cost = Math.random() * 0.003;
            let duration: number;
            if (provider === 'openai' && feature === 'stt') {
                duration = 10 + Math.floor(Math.random() * 91); // 10~100
            } else {
                duration = -1;
            }            
            const log = {
                id: crypto.randomUUID(),
                timestamp,
                timestampISO,
                provider,
                model,
                endpoint: 'test',
                feature,
                requestSize,
                responseSize,
                requestTokens,
                responseTokens,
                totalTokens,
                duration,
                cost: Number(cost.toFixed(6)),
                latency,
                success,
                errorMessage,
                sessionId,
                userAgent,
                version
            };
            await this.dbManager.addLog(log);
        }
    }

    /*
    async logAPICallTest(days: number, count: number) {
        // models.json에서 feature별 허용 모델 매핑
        const modelFeatureMap = {
            web: 'webModel',
            pdf: 'pdfModel',
            stt: 'sttModel',
            'stt-summary': 'transcriptSummaryModel',
            'stt-refine': 'transcriptSummaryModel',
            custom: 'customModel'
        };
        // models.json import (이미 로드된 객체를 사용하거나 import 필요)
        // 예시: import modelsJson from './models.json';
        const modelsJson = this.plugin.modelsJson;
        const modelList = modelsJson.model_list || {};

        const features = ['web', 'pdf', 'stt', 'stt-summary', 'stt-refine', 'custom'] as const;
        type FeatureType = typeof features[number];
        const providers: ('openai' | 'gemini')[] = ['openai', 'gemini'];
        const now = Date.now();
        const oneYear = days * 24 * 60 * 60 * 1000;
        function randomStr(len: number) {
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return s;
        }
        for (let i = 0; i < count; i++) {
            // 날짜 랜덤
            const timestamp = now - Math.floor(Math.random() * oneYear);
            const timestampISO = new Date(timestamp).toISOString();
            // feature 랜덤
            const feature = features[Math.floor(Math.random() * features.length)] as FeatureType;
            // feature에 맞는 모델리스트
            const modelKey = modelFeatureMap[feature];
            const modelObj = modelList[modelKey]?.models || {};
            const allModels = Object.keys(modelObj);
            // openai/gemini 분리
            const openaiModels = allModels.filter(m => m.startsWith('gpt') || m.startsWith('o'));
            const geminiModels = allModels.filter(m => m.startsWith('gemini'));
            // provider 랜덤
            const provider: 'openai' | 'gemini' = providers[Math.floor(Math.random() * providers.length)] as 'openai' | 'gemini';
            let model = '';
            if (provider === 'openai') {
                if (openaiModels.length === 0) continue;
                model = openaiModels[Math.floor(Math.random() * openaiModels.length)];
            } else {
                if (geminiModels.length === 0) continue;
                model = geminiModels[Math.floor(Math.random() * geminiModels.length)];
            }
            // 기타 값 랜덤
            const requestSize = 100 + Math.floor(Math.random() * 101);
            const responseSize = 100 + Math.floor(Math.random() * 101);
            const latency = 1000 + Math.floor(Math.random() * 3001);
            const success = Math.random() < 0.8; // 성공 80% 확률
            const errorMessage = success ? undefined : 'Error occurred: ' + randomStr(8);
            const sessionId = randomStr(10 + Math.floor(Math.random() * 11));
            const userAgent = `Obsidian-Summar/${this.plugin.manifest?.version ?? '1.0.0'}`;
            const version = '1.0.0';
            const requestTokens = 100 + Math.floor(Math.random() * 100);
            const responseTokens = 100 + Math.floor(Math.random() * 100);
            const totalTokens = requestTokens + responseTokens;
            const cost = Math.random() * 0.003;
            let duration: number;
            if (provider === 'openai' && feature === 'stt') {
                duration = 1000 + Math.floor(Math.random() * 9100)/100; // 10~100
            } else {
                duration = -1;
            }
            const log = {
                id: crypto.randomUUID(),
                timestamp,
                timestampISO,
                provider,
                model,
                endpoint: 'test',
                feature,
                requestSize,
                responseSize,
                requestTokens,
                responseTokens,
                totalTokens,
                duration,
                cost: Number(cost.toFixed(6)),
                latency,
                success,
                errorMessage,
                sessionId,
                userAgent,
                version
            };
            await this.dbManager.addLog(log);
        }
    }
    */
   
    async deleteTestLog(): Promise<number> {
        return this.dbManager.deleteIf(log => log.endpoint === 'test');
    }
}