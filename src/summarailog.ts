// API 로그 인터페이스
export interface APICallLog {
    id: string;
    timestamp: number;
    provider: 'openai' | 'gemini' | 'claude';
    model: string;
    endpoint: string;
    feature: string;
    
    requestSize: number;
    responseSize: number;
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
    
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
    private dbName = 'ai-api-logs.db';
    private dbVersion = 1;
    private db: IDBDatabase | null = null;

    async init(): Promise<void> {
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
}

// API 클라이언트 (IndexedDB 연동)
export class TrackedAPIClient {
    private dbManager: IndexedDBManager;
    private sessionId: string;

    constructor(dbManager: IndexedDBManager) {
        this.dbManager = dbManager;
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async callOpenAI(endpoint: string, payload: any, feature: string): Promise<any> {
        const startTime = Date.now();
        
        try {
            const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
                method: 'POST',
                headers: {
                    // 'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const responseData = await response.json();
            const latency = Date.now() - startTime;

            // IndexedDB에 로그 저장
            await this.logAPICall('openai', payload.model || 'unknown', endpoint, feature, payload, responseData, latency, response.ok);

            if (!response.ok) {
                throw new Error(responseData.error?.message || 'OpenAI API Error');
            }

            return responseData;

        } catch (error) {
            const latency = Date.now() - startTime;
            await this.logAPICall('openai', payload.model || 'unknown', endpoint, feature, payload, null, latency, false, error.message);
            throw error;
        }
    }

    async callGemini(endpoint: string, payload: any, feature: string): Promise<any> {
        const startTime = Date.now();
        
        try {
            // const response = await fetch(
            //     // `https://generativelanguage.googleapis.com/v1/${endpoint}?key=${this.settings.geminiApiKey}`,
            //     {
            //         method: 'POST',
            //         headers: { 'Content-Type': 'application/json' },
            //         body: JSON.stringify(payload)
            //     }
            // );

            // const responseData = await response.json();
            // const latency = Date.now() - startTime;

            // await this.logAPICall('gemini', this.extractGeminiModel(endpoint), endpoint, feature, payload, responseData, latency, response.ok);

            // if (!response.ok) {
            //     throw new Error(responseData.error?.message || 'Gemini API Error');
            // }

            // return responseData;

        } catch (error) {
            const latency = Date.now() - startTime;
            await this.logAPICall('gemini', this.extractGeminiModel(endpoint), endpoint, feature, payload, null, latency, false, error.message);
            throw error;
        }
    }

    async logAPICall(
        provider: string,
        model: string,
        endpoint: string,
        feature: string,
        requestData: any,
        responseData: any,
        latency: number,
        success: boolean,
        error?: string
    ) {
        // if (!this.settings.enableIndexedDB) return;

        const requestSize = new Blob([JSON.stringify(requestData)]).size;
        const responseSize = responseData ? new Blob([JSON.stringify(responseData)]).size : 0;

        const logEntry: APICallLog = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            provider: provider as any,
            model,
            endpoint,
            feature,
            
            requestSize,
            responseSize,
            
            latency,
            success,
            errorMessage: error,
            
            sessionId: this.sessionId,
            userAgent: 'Obsidian-Plugin',
            version: '1.0.0',
            
            ...this.parseUsageData(provider, responseData)
        };

        try {
            await this.dbManager.addLog(logEntry);
        } catch (error) {
            console.error('Failed to save log to IndexedDB:', error);
        }
    }

    private parseUsageData(provider: string, responseData: any) {
        if (!responseData) return {};

        if (provider === 'openai' && responseData.usage) {
            return {
                requestTokens: responseData.usage.prompt_tokens,
                responseTokens: responseData.usage.completion_tokens,
                totalTokens: responseData.usage.total_tokens,
                cost: this.calculateOpenAICost(responseData.model || '', responseData.usage)
            };
        }

        if (provider === 'gemini' && responseData.usageMetadata) {
            return {
                requestTokens: responseData.usageMetadata.promptTokenCount,
                responseTokens: responseData.usageMetadata.candidatesTokenCount,
                totalTokens: responseData.usageMetadata.totalTokenCount,
                cost: this.calculateGeminiCost(responseData.usageMetadata)
            };
        }

        return {};
    }

    private calculateOpenAICost(model: string, usage: any): number {
        const pricing: Record<string, { input: number; output: number }> = {
            'gpt-4': { input: 0.03, output: 0.06 },
            'gpt-4-turbo': { input: 0.01, output: 0.03 },
            'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
            'whisper-1': { input: 0.006, output: 0 }
        };
        
        const price = pricing[model] || { input: 0, output: 0 };
        return (usage.prompt_tokens * price.input / 1000) + 
               (usage.completion_tokens * price.output / 1000);
    }

    private calculateGeminiCost(usage: any): number {
        const pricePerToken = 0.0005 / 1000;
        return usage.totalTokenCount * pricePerToken;
    }

    private extractGeminiModel(endpoint: string): string {
        const match = endpoint.match(/models\/([^:\/]+)/);
        return match ? match[1] : 'unknown';
    }
}