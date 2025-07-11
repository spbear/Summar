import { Plugin } from "obsidian";
import SummarPlugin from "./main";
import { IndexedDBManager, TrackedAPIClient} from "./summarailog";

// Chart.js를 CDN에서 동적으로 로드
function loadChartJs(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).Chart) return resolve();
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export class SummarStatsModal {
  private plugin: SummarPlugin;
  private modalBg: HTMLDivElement | null = null;
  private chart: any = null;
  private currentPeriod: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'hourly';
  private currentMetric: 'totalCalls' | 'totalTokens' | 'totalCost' | 'avgLatency' | 'successRate' = 'totalCalls';
  private periodButtons: Record<string, HTMLButtonElement> = {};
  private metricDivs: Record<string, HTMLDivElement> = {};
  private chartArea: HTMLDivElement | null = null;
  private summaryStats: any[] = [];

  private currentProvider: string = 'all';
  private visibleFeatures: Set<string> = new Set();

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
  }

  /**
   * 외부 컨테이너에 대시보드 UI를 렌더링합니다.
   * containerEl: HTMLElement (예: settings 탭의 div)
   * options: { showDialogUI?: boolean } - true면 모달(닫기버튼 등), false면 내용만
   */
  async buildStatsView(containerEl: HTMLElement, options?: { showDialogUI?: boolean }) {
    // 기존 내용 비우기(중복 방지)
    containerEl.innerHTML = '';

    // 1. "로딩중" 표시만 먼저 보여주기
    const loadingDiv = document.createElement('div');
    loadingDiv.style.display = 'flex';
    loadingDiv.style.alignItems = 'center';
    loadingDiv.style.justifyContent = 'center';
    loadingDiv.style.height = '320px';
    loadingDiv.innerHTML = `<span style="color:var(--text-muted);font-size:1.1em;">Loading statistics dashboard...</span>`;
    containerEl.appendChild(loadingDiv);

    // 2. 다음 tick(이벤트 루프)에서 실제 UI 렌더링
    setTimeout(() => {
      containerEl.innerHTML = ''; // 로딩중 표시 제거

      // 모달 스타일
      const modal = document.createElement('div');
      modal.style.background = 'var(--background-primary)';
      modal.style.borderRadius = '12px';
      modal.style.padding = '32px 24px';
      modal.style.minWidth = '600px';
      modal.style.maxWidth = '90vw';
      modal.style.maxHeight = '80vh';
      modal.style.overflowY = 'auto';
      modal.style.position = options?.showDialogUI ? 'absolute' : '';
      modal.style.top = options?.showDialogUI ? '50%' : '';
      modal.style.left = options?.showDialogUI ? '50%' : '';
      modal.style.transform = options?.showDialogUI ? 'translate(-50%, -50%)' : '';
      // border, shadow 조건 분기
      if (options?.showDialogUI) {
        modal.style.boxShadow = '0 4px 32px rgba(0,0,0,0.2)';
        modal.style.border = '';
      } else {
        modal.style.boxShadow = 'none';
        modal.style.border = 'none';
      }

      // 헤더
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '16px';
      const title = document.createElement('span');
      title.innerHTML = '<b>AI API Statistics Dashboard</b>';
      title.style.fontSize = '1.5em';
      header.appendChild(title);

      // 닫기 버튼(옵션에 따라)
      if (options?.showDialogUI) {
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.fontSize = '1.7em';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = 'var(--text-normal)';
        closeBtn.style.marginLeft = '16px';
        closeBtn.style.lineHeight = '1';
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          this.close();
        };
        header.appendChild(closeBtn);
      }
      modal.appendChild(header);

      // 기간/필터 행 생성
      const filterRow = document.createElement('div');
      filterRow.style.display = 'flex';
      filterRow.style.justifyContent = 'space-between';
      filterRow.style.alignItems = 'center';
      filterRow.style.marginBottom = '16px';

      // 기간 선택 탭
      const periodTabs = document.createElement('div');
      periodTabs.style.display = 'flex';
      periodTabs.style.gap = '8px';
      const periods: [string, string, number][] = [
        ['Hourly', 'hourly', 24],
        ['Daily', 'daily', 7],
        ['Weekly', 'weekly', 8],
        ['Monthly', 'monthly', 12],
      ];
      periods.forEach(([label, value]) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.padding = '6px 16px';
        btn.style.borderRadius = '6px';
        btn.style.border = '1px solid var(--background-modifier-border)';
        btn.style.background = 'var(--background-secondary)';
        btn.style.cursor = 'pointer';
        btn.onclick = (e) => {
          e.stopPropagation();
          this.setPeriod(value as any);
          // 모달 닫힘 방지
          if (options?.showDialogUI) e.preventDefault();
        };
        this.periodButtons[value] = btn;
        periodTabs.appendChild(btn);
      });

      const providerBox = document.createElement('div');
      providerBox.style.display = 'flex';
      providerBox.style.alignItems = 'center';
      providerBox.style.gap = '4px';

      // provider select
      const providerSelect = document.createElement('select');
      providerSelect.style.marginLeft = '16px';
      providerSelect.style.padding = '6px 12px';
      providerSelect.style.borderRadius = '6px';
      providerSelect.style.border = '1px solid var(--background-modifier-border)';
      providerSelect.style.background = 'var(--background-secondary)';
      providerSelect.style.cursor = 'pointer';
      ['all', 'openai', 'gemini'].forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p === 'all' ? 'All' : p;
        providerSelect.appendChild(opt);
      });
      providerSelect.value = this.currentProvider;
      providerSelect.onchange = (e) => {
        e.stopPropagation();
        this.setProvider(providerSelect.value);
        // 모달 닫힘 방지
        if (options?.showDialogUI) e.preventDefault();
      };
      providerBox.appendChild(providerSelect);

      filterRow.appendChild(periodTabs);
      filterRow.appendChild(providerBox);

      modal.appendChild(filterRow);

      // 요약 카드 영역
      const summaryCards = document.createElement('div');
      summaryCards.style.display = 'flex';
      summaryCards.style.gap = '16px';
      summaryCards.style.marginBottom = '24px';
      summaryCards.innerHTML = `
        <div id="ai-card-totalCalls" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
          <div>Total Calls</div><div id="ai-total-calls" style="font-size:1.3em;font-weight:bold;">-</div>
        </div>
        <div id="ai-card-totalTokens" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
          <div>Total Tokens</div><div id="ai-total-tokens" style="font-size:1.3em;font-weight:bold;">-</div>
        </div>
        <div id="ai-card-totalCost" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
          <div>Total Cost ($)</div><div id="ai-total-cost" style="font-size:1.3em;font-weight:bold;">-</div>
        </div>
        <div id="ai-card-avgLatency" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
          <div>Avg Latency (ms)</div><div id="ai-avg-latency" style="font-size:1.3em;font-weight:bold;">-</div>
        </div>
        <div id="ai-card-successRate" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
          <div>Success Rate (%)</div><div id="ai-success-rate" style="font-size:1.3em;font-weight:bold;">-</div>
        </div>
      `;
      modal.appendChild(summaryCards);

      // 카드 클릭 이벤트 등록
      this.metricDivs = {
        totalCalls: summaryCards.querySelector('#ai-card-totalCalls') as HTMLDivElement,
        totalTokens: summaryCards.querySelector('#ai-card-totalTokens') as HTMLDivElement,
        totalCost: summaryCards.querySelector('#ai-card-totalCost') as HTMLDivElement,
        avgLatency: summaryCards.querySelector('#ai-card-avgLatency') as HTMLDivElement,
        successRate: summaryCards.querySelector('#ai-card-successRate') as HTMLDivElement,
      };
      Object.entries(this.metricDivs).forEach(([metric, div]) => {
        div.onclick = (e) => {
          e.stopPropagation();
          this.setMetric(metric as any);
          // 모달 닫힘 방지
          if (options?.showDialogUI) e.preventDefault();
        };
      });

      // 차트 영역(로딩 표시)
      this.chartArea = document.createElement('div');
      this.chartArea.style.height = '260px';
      this.chartArea.style.background = 'var(--background-secondary)';
      this.chartArea.style.borderRadius = '8px';
      this.chartArea.style.marginBottom = '16px';
      this.chartArea.style.display = 'flex';
      this.chartArea.style.alignItems = 'center';
      this.chartArea.style.justifyContent = 'center';
      this.chartArea.innerHTML = `<span style="color:var(--text-muted);font-size:1.1em;">Loading chart...</span>`;
      modal.appendChild(this.chartArea);

      // 내보내기/비교/예측/알림 등 고급 기능 버튼(placeholder)
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '12px';
      actions.style.marginTop = '12px';
      if (this.plugin.settingsv2.system.debugLevel > 0) {
          actions.innerHTML = `
          <button id="ai-export-csv">Export CSV</button>
          <button id="ai-recalc-cost">Recalculate Cost</button>
          <button id="ai-reset-db">Reset DB</button>
          <button id="ai-create-test-data">Create Test Data</button>
          <button id="ai-delete-test-data">Delete Test Data</button>
          `;
      } else {
          actions.innerHTML = `
          <button id="ai-export-csv">Export CSV</button>
          `;
      }
      modal.appendChild(actions);

      // CSV 내보내기 버튼 이벤트
      const exportCsvBtn = actions.querySelector('#ai-export-csv') as HTMLButtonElement;
      exportCsvBtn.onclick = async (e) => {
          e?.stopPropagation?.();
          // summar-ai-api-logs-db 전체 로그를 CSV로 변환
          const logs = await this.plugin.dbManager.getLogs();
          if (!logs || logs.length === 0) {
              alert('No data to export.');
              return;
          }
          // CSV 헤더
          const headers = [
              'id', 'timestamp', 'timestampISO', 'provider', 'model', 'actualModelUsed', 'endpoint', 'feature', 'requestSize', 'responseSize', 'requestTokens', 'responseTokens', 'totalTokens', 'duration', 'cost', 'latency', 'success', 'errorMessage', 'sessionId', 'userAgent', 'version'
          ];
          const rows = logs.map(log => headers.map(h => {
              let v = log[h as keyof typeof log];
              if (typeof v === 'string') return '"' + v.replace(/"/g, '""') + '"';
              if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
              return v ?? '';
          }).join(','));
          const csv = [headers.join(','), ...rows].join('\n');
          // 파일 저장 dialog
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.plugin.dbManager.dbName}.csv`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
          }, 100);
      };

      // 비용 재계산 버튼 이벤트
      const recalcBtn = actions.querySelector('#ai-recalc-cost') as HTMLButtonElement;
      if (recalcBtn) recalcBtn.onclick = async (e) => {
        e?.stopPropagation?.();
        const trackapi = new TrackedAPIClient(this.plugin);
        const updated = await trackapi.recalcCost();
          alert(`Cost recalculation complete: ${updated} rows updated.`);
          await this.updateStatsAndChart();
        if (options?.showDialogUI) e?.preventDefault?.();
      };

      // 초기화 버튼 이벤트
      const resetBtn = actions.querySelector('#ai-reset-db') as HTMLButtonElement;
      if (resetBtn) resetBtn.onclick = async (e) => {
        e?.stopPropagation?.();
        // 커스텀 경고 모달 생성
        const confirmBg = document.createElement('div');
        confirmBg.style.position = 'fixed';
        confirmBg.style.top = '0';
        confirmBg.style.left = '0';
        confirmBg.style.width = '100vw';
        confirmBg.style.height = '100vh';
        confirmBg.style.background = 'rgba(0,0,0,0.3)';
        confirmBg.style.zIndex = '10000';
        const confirmBox = document.createElement('div');
        confirmBox.style.position = 'absolute';
        confirmBox.style.top = '50%';
        confirmBox.style.left = '50%';
        confirmBox.style.transform = 'translate(-50%, -50%)';
        confirmBox.style.background = 'var(--background-primary)';
        confirmBox.style.borderRadius = '12px';
        confirmBox.style.boxShadow = '0 4px 32px rgba(0,0,0,0.2)';
        confirmBox.style.padding = '32px 24px';
        confirmBox.style.minWidth = '320px';
        confirmBox.style.textAlign = 'center';
        confirmBox.innerHTML = `<div style="margin-bottom:18px;font-size:1.1em;">Resetting will delete all records.<br>Are you sure?</div>`;
        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'Yes';
        yesBtn.style.margin = '0 12px';
        yesBtn.style.padding = '8px 24px';
        yesBtn.style.background = 'var(--background-secondary)';
        yesBtn.style.color = 'var(--text-normal)';
        yesBtn.style.border = '1px solid var(--background-modifier-border)';
        yesBtn.style.borderRadius = '6px';
        yesBtn.style.cursor = 'pointer';
        const noBtn = document.createElement('button');
        noBtn.textContent = 'No';
        noBtn.style.margin = '0 12px';
        noBtn.style.padding = '8px 24px';
        noBtn.style.background = 'var(--color-accent)';
        noBtn.style.color = 'white';
        noBtn.style.border = 'none';
        noBtn.style.borderRadius = '6px';
        noBtn.style.cursor = 'pointer';
        confirmBox.appendChild(yesBtn);
        confirmBox.appendChild(noBtn);
        confirmBg.appendChild(confirmBox);
        document.body.appendChild(confirmBg);
        noBtn.onclick = () => { document.body.removeChild(confirmBg); };
        yesBtn.onclick = async () => {
            document.body.removeChild(confirmBg);
            if (!this.plugin.dbManager) return;
            const db = this.plugin.dbManager['db'];
            if (db) {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(['api_logs', 'daily_stats'], 'readwrite');
                    const logsStore = tx.objectStore('api_logs');
                    const statsStore = tx.objectStore('daily_stats');
                    const clear1 = logsStore.clear();
                    const clear2 = statsStore.clear();
                    let done = 0;
                    const check = () => { if (++done === 2) resolve(undefined); };
                    clear1.onsuccess = check; clear2.onsuccess = check;
                    clear1.onerror = () => reject(clear1.error);
                    clear2.onerror = () => reject(clear2.error);
                });
            }
            alert('DB has been reset.');
            await this.updateStatsAndChart();
        };
      };

      // 테스트 데이터 생성 버튼 이벤트
      const testDataBtn = actions.querySelector('#ai-create-test-data') as HTMLButtonElement;
      if (testDataBtn) testDataBtn.onclick = async (e) => {
        e?.stopPropagation?.();
        const client = new TrackedAPIClient(this.plugin);
        await client.logAPICallTest(300, 1000);
        alert('Test data has been added.');
        await this.updateStatsAndChart();
        if (options?.showDialogUI) e?.preventDefault?.();
      };

      // 테스트 데이터 삭제 버튼 이벤트
      const deleteTestDataBtn = actions.querySelector('#ai-delete-test-data') as HTMLButtonElement;
      if (deleteTestDataBtn) deleteTestDataBtn.onclick = async (e) => {
        e?.stopPropagation?.();
        // 커스텀 경고 모달 생성
        const confirmBg = document.createElement('div');
        confirmBg.style.position = 'fixed';
        confirmBg.style.top = '0';
        confirmBg.style.left = '0';
        confirmBg.style.width = '100vw';
        confirmBg.style.height = '100vh';
        confirmBg.style.background = 'rgba(0,0,0,0.3)';
        confirmBg.style.zIndex = '10000';
        const confirmBox = document.createElement('div');
        confirmBox.style.position = 'absolute';
        confirmBox.style.top = '50%';
        confirmBox.style.left = '50%';
        confirmBox.style.transform = 'translate(-50%, -50%)';
        confirmBox.style.background = 'var(--background-primary)';
        confirmBox.style.borderRadius = '12px';
        confirmBox.style.boxShadow = '0 4px 32px rgba(0,0,0,0.2)';
        confirmBox.style.padding = '32px 24px';
        confirmBox.style.minWidth = '320px';
        confirmBox.style.textAlign = 'center';
        confirmBox.innerHTML = `<div style="margin-bottom:18px;font-size:1.1em;">Are you sure you want to delete test data?</div>`;
        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'Yes';
        yesBtn.style.margin = '0 12px';
        yesBtn.style.padding = '8px 24px';
        yesBtn.style.background = 'var(--background-secondary)';
        yesBtn.style.color = 'var(--text-normal)';
        yesBtn.style.border = '1px solid var(--background-modifier-border)';
        yesBtn.style.borderRadius = '6px';
        yesBtn.style.cursor = 'pointer';
        const noBtn = document.createElement('button');
        noBtn.textContent = 'No';
        noBtn.style.margin = '0 12px';
        noBtn.style.padding = '8px 24px';
        noBtn.style.background = 'var(--color-accent)';
        noBtn.style.color = 'white';
        noBtn.style.border = 'none';
        noBtn.style.borderRadius = '6px';
        noBtn.style.cursor = 'pointer';
        confirmBox.appendChild(yesBtn);
        confirmBox.appendChild(noBtn);
        confirmBg.appendChild(confirmBox);
        document.body.appendChild(confirmBg);
        noBtn.onclick = () => { document.body.removeChild(confirmBg); };
        yesBtn.onclick = async () => {
          document.body.removeChild(confirmBg);
          const client = new TrackedAPIClient(this.plugin);
          const number = await client.deleteTestLog();
          alert(`Deleted ${number} test data.`);
          await this.updateStatsAndChart();
        }
      };

      containerEl.appendChild(modal);

      // 디폴트: 시간별, 총호출수
      // Chart.js 로딩과 데이터 fetch를 병렬로 처리
      let chartJsLoaded = false;
      let statsReady = false;

      // 1. UI(카드 등) 먼저 그리기
      this.setPeriod('hourly');

      // 2. Chart.js 비동기 로드
      loadChartJs().then(() => {
        chartJsLoaded = true;
        // 차트가 이미 준비된 경우 차트 그리기
        if (statsReady) this.updateChart();
      });

      // 3. 데이터 fetch 후 차트 그리기(Chart.js가 준비된 경우)
      // setPeriod('hourly')에서 updateStatsAndChart()가 호출되며, updateChart()도 호출됨
      // updateChart()에서 Chart.js가 없으면 아무것도 하지 않음
      // Chart.js가 로드된 후 updateChart()를 다시 호출
      const origUpdateChart = this.updateChart.bind(this);
      this.updateChart = () => {
        if (!chartJsLoaded) return; // Chart.js가 아직 없으면 대기
        origUpdateChart();
      };

      // 4. 데이터 준비 완료 플래그
      statsReady = true;

      // 모달 내부 클릭 시 이벤트 버블링 방지 (중요!)
      modal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }, 0);
  }

  async open() {
    await loadChartJs();
    this.modalBg = document.createElement('div');
    this.modalBg.style.position = 'fixed';
    this.modalBg.style.top = '0';
    this.modalBg.style.left = '0';
    this.modalBg.style.width = '100vw';
    this.modalBg.style.height = '100vh';
    this.modalBg.style.background = 'rgba(0,0,0,0.3)';
    this.modalBg.style.zIndex = '9999';

    // 모달 바깥 클릭 시 닫기
    this.modalBg.addEventListener('mousedown', this.handleBgClick);
    // ESC 키로 닫기
    window.addEventListener('keydown', this.handleEscKey);

    // 모달 내부 생성은 buildStatsView를 사용 (showDialogUI: true)
    this.buildStatsView(this.modalBg, { showDialogUI: true });
    document.body.appendChild(this.modalBg);

    // 디폴트: 시간별, 총호출수
    this.setPeriod('hourly');
  }

  // 모달 바깥 클릭 핸들러
  private handleBgClick = (e: MouseEvent) => {
    this.close();
  };

  // ESC 키 핸들러
  private handleEscKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
      this.close();
    }
  };

  async setProvider(provider: string) {
    this.currentProvider = provider;
    await this.updateStatsAndChart();
  }

  async setPeriod(period: 'hourly' | 'daily' | 'weekly' | 'monthly') {
    this.currentPeriod = period;
    // 버튼 스타일 업데이트
    Object.entries(this.periodButtons).forEach(([key, btn]) => {
      btn.style.background = key === period ? 'var(--background-modifier-active-hover)' : 'var(--background-secondary)';
      btn.style.fontWeight = key === period ? 'bold' : 'normal';
    });
    // 데이터 fetch 및 요약/차트 갱신
    await this.updateStatsAndChart();
  }

  async setMetric(metric: 'totalCalls' | 'totalTokens' | 'totalCost' | 'avgLatency' | 'successRate') {
    this.currentMetric = metric;
    // 카드 스타일 업데이트
    Object.entries(this.metricDivs).forEach(([key, div]) => {
      div.style.outline = key === metric ? '2px solid var(--color-accent)' : '';
      div.style.background = key === metric ? 'var(--background-modifier-active-hover)' : 'var(--background-secondary)';
    });
    // 차트 갱신
    this.updateChart();

    // --- 추가: legend를 모두 on으로 초기화 ---
    // feature 목록 추출
    let features: string[] = [];
    if (this.summaryStats.length > 0 && this.summaryStats[0].features) {
      const allFeatures = new Set<string>();
      this.summaryStats.forEach(s => {
        Object.keys(s.features || {}).forEach(f => allFeatures.add(f));
      });
      features = Array.from(allFeatures);
    }
    this.visibleFeatures = new Set(features);
    this.updateSummaryCards(this.summaryStats, this.visibleFeatures);    
  }

  async updateStatsAndChart() {
    // 기간별 데이터 fetch
    let stats: any[] = [];
    const providerOpt = this.currentProvider === 'all' ? undefined : this.currentProvider;
    if (this.plugin.dbManager) {
      if (this.currentPeriod === 'hourly') {
        stats = await this.getHourlyStats(providerOpt);
      } else if (this.currentPeriod === 'daily') {
        stats = await this.getDailyStats(providerOpt);
      } else if (this.currentPeriod === 'weekly') {
        stats = await this.getWeeklyStats(providerOpt);
      } else if (this.currentPeriod === 'monthly') {
        stats = await this.getMonthlyStats(providerOpt);
      }
    }
    this.summaryStats = stats;
    // 요약 카드 업데이트
    this.updateSummaryCards(stats);
    // 차트 업데이트
    this.setMetric(this.currentMetric); // metric 스타일 및 차트 갱신
  }

  /**
   * 오늘 날짜의 0~23시까지의 로그를 시간별로 집계
   */
  async getHourlyStats(provider?: string): Promise<any[]> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    const start = new Date(year, month, date, 0, 0, 0, 0);
    const end = new Date(year, month, date, 23, 59, 59, 999);
    const logs = await this.plugin.dbManager.getLogs({
      startDate: start,
      endDate: end,
      provider: provider
    });
    // 0~23시별로 집계
    const hourlyStats: any[] = Array.from({ length: 24 }, (_, h) => ({
      period: `${h}시`,
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      avgLatency: 0,
      successRate: 0,
      features: {},
      featureTokens: {},
      featureCosts: {},
      featureLatencies: {},
      featureSuccessRates: {},
    }));
    for (const log of logs) {
      const d = new Date(log.timestamp);
      const hour = d.getHours();
      const stat = hourlyStats[hour];
      stat.totalCalls++;
      stat.totalTokens += log.totalTokens || 0;
      stat.totalCost += log.cost || 0;
      stat.avgLatency += log.latency || 0;
      stat.successRate += log.success ? 1 : 0;
      // feature별
      if (log.feature) {
        stat.features[log.feature] = (stat.features[log.feature] || 0) + 1;
        stat.featureTokens[log.feature] = (stat.featureTokens[log.feature] || 0) + (log.totalTokens || 0);
        stat.featureCosts[log.feature] = (stat.featureCosts[log.feature] || 0) + (log.cost || 0);
        stat.featureLatencies[log.feature] = (stat.featureLatencies[log.feature] || 0) + (log.latency || 0);
        stat.featureSuccessRates[log.feature] = (stat.featureSuccessRates[log.feature] || 0) + (log.success ? 1 : 0);
      }
    }
    // 평균값 계산
    hourlyStats.forEach(stat => {
      if (stat.totalCalls > 0) {
        stat.avgLatency = stat.avgLatency / stat.totalCalls;
        stat.successRate = (stat.successRate / stat.totalCalls) * 100;
        // feature별 평균
        Object.keys(stat.featureLatencies).forEach(f => {
          stat.featureLatencies[f] = stat.featureLatencies[f] / (stat.features[f] || 1);
        });
        Object.keys(stat.featureSuccessRates).forEach(f => {
          stat.featureSuccessRates[f] = (stat.featureSuccessRates[f] / (stat.features[f] || 1)) * 100;
        });
      }
    });
    return hourlyStats;
  }

  /**
   * 최근 7일간의 로그을 일별로 집계
   */
  async getDailyStats(provider?: string): Promise<any[]> {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 6); // 7일간
    const logs = await this.plugin.dbManager.getLogs({
      startDate: start,
      endDate: end,
      provider: provider
    });
    // 날짜별 집계
    const dayMap: Record<string, any> = {};
    for (const log of logs) {
      const d = new Date(log.timestamp);
      const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
      if (!dayMap[key]) {
        dayMap[key] = {
          period: key,
          totalCalls: 0,
          totalTokens: 0,
          totalCost: 0,
          avgLatency: 0,
          successRate: 0,
          features: {},
          featureTokens: {},
          featureCosts: {},
          featureLatencies: {},
          featureSuccessRates: {},
        };
      }
      const stat = dayMap[key];
      stat.totalCalls++;
      stat.totalTokens += log.totalTokens || 0;
      stat.totalCost += log.cost || 0;
      stat.avgLatency += log.latency || 0;
      stat.successRate += log.success ? 1 : 0;
      // feature별
      if (log.feature) {
        stat.features[log.feature] = (stat.features[log.feature] || 0) + 1;
        stat.featureTokens[log.feature] = (stat.featureTokens[log.feature] || 0) + (log.totalTokens || 0);
        stat.featureCosts[log.feature] = (stat.featureCosts[log.feature] || 0) + (log.cost || 0);
        stat.featureLatencies[log.feature] = (stat.featureLatencies[log.feature] || 0) + (log.latency || 0);
        stat.featureSuccessRates[log.feature] = (stat.featureSuccessRates[log.feature] || 0) + (log.success ? 1 : 0);
      }
    }
    // 7일간 누락된 날짜도 0으로 채움
    const stats: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
      const stat = dayMap[key] || {
        period: key,
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        avgLatency: 0,
        successRate: 0,
        features: {},
        featureTokens: {},
        featureCosts: {},
        featureLatencies: {},
        featureSuccessRates: {},
      };
      if (stat.totalCalls > 0) {
        stat.avgLatency = stat.avgLatency / stat.totalCalls;
        stat.successRate = (stat.successRate / stat.totalCalls) * 100;
        // feature별 평균
        Object.keys(stat.featureLatencies).forEach(f => {
          stat.featureLatencies[f] = stat.featureLatencies[f] / (stat.features[f] || 1);
        });
        Object.keys(stat.featureSuccessRates).forEach(f => {
          stat.featureSuccessRates[f] = (stat.featureSuccessRates[f] / (stat.features[f] || 1)) * 100;
        });
      }
      stats.push(stat);
    }
    return stats;
  }

  /**
   * 최근 8주간의 로그를 주별로 집계
   */
  async getWeeklyStats(provider?: string): Promise<any[]> {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 7 * 8 + 1); // 8주간
    const logs = await this.plugin.dbManager.getLogs({
      startDate: start,
      endDate: end,
      provider: provider
    });
    // 주별 집계 (ISO week)
    const weekMap: Record<string, any> = {};
    for (const log of logs) {
      const d = new Date(log.timestamp);
      const year = d.getFullYear();
      const week = getWeekNumber(d)-1;
      const key = `${year}-W${week.toString().padStart(2, '0')}`;
      if (!weekMap[key]) {
        weekMap[key] = {
          period: key,
          totalCalls: 0,
          totalTokens: 0,
          totalCost: 0,
          avgLatency: 0,
          successRate: 0,
          features: {},
          featureTokens: {},
          featureCosts: {},
          featureLatencies: {},
          featureSuccessRates: {},
        };
      }
      const stat = weekMap[key];
      stat.totalCalls++;
      stat.totalTokens += log.totalTokens || 0;
      stat.totalCost += log.cost || 0;
      stat.avgLatency += log.latency || 0;
      stat.successRate += log.success ? 1 : 0;
      // feature별
      if (log.feature) {
        stat.features[log.feature] = (stat.features[log.feature] || 0) + 1;
        stat.featureTokens[log.feature] = (stat.featureTokens[log.feature] || 0) + (log.totalTokens || 0);
        stat.featureCosts[log.feature] = (stat.featureCosts[log.feature] || 0) + (log.cost || 0);
        stat.featureLatencies[log.feature] = (stat.featureLatencies[log.feature] || 0) + (log.latency || 0);
        stat.featureSuccessRates[log.feature] = (stat.featureSuccessRates[log.feature] || 0) + (log.success ? 1 : 0);
      }
    }
    // 8주간 누락된 주도 0으로 채움
    const stats: any[] = [];
    let d = new Date(start.getTime());
    for (let i = 0; i < 8; i++) {
      // ISO week 계산
      const year = d.getFullYear();
      const week = getWeekNumber(d);
      const key = `${year}-W${week.toString().padStart(2, '0')}`;
      const stat = weekMap[key] || {
        period: key,
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        avgLatency: 0,
        successRate: 0,
        features: {},
        featureTokens: {},
        featureCosts: {},
        featureLatencies: {},
        featureSuccessRates: {},
      };
      if (stat.totalCalls > 0) {
        stat.avgLatency = stat.avgLatency / stat.totalCalls;
        stat.successRate = (stat.successRate / stat.totalCalls) * 100;
        Object.keys(stat.featureLatencies).forEach(f => {
          stat.featureLatencies[f] = stat.featureLatencies[f] / (stat.features[f] || 1);
        });
        Object.keys(stat.featureSuccessRates).forEach(f => {
          stat.featureSuccessRates[f] = (stat.featureSuccessRates[f] / (stat.features[f] || 1)) * 100;
        });
      }
      stats.push(stat);
      d.setDate(d.getDate() + 7);
    }
    return stats;
  }

  /**
   * 최근 12개월간의 로그를 월별로 집계
   */
  async getMonthlyStats(provider?: string): Promise<any[]> {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = new Date(end);
    start.setMonth(end.getMonth() - 11); // 12개월간
    const logs = await this.plugin.dbManager.getLogs({
      startDate: start,
      endDate: end,
      provider: provider
    });
    // 월별 집계
    const monthMap: Record<string, any> = {};
    for (const log of logs) {
      const d = new Date(log.timestamp);
      const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
      if (!monthMap[key]) {
        monthMap[key] = {
          period: key,
          totalCalls: 0,
          totalTokens: 0,
          totalCost: 0,
          avgLatency: 0,
          successRate: 0,
          features: {},
          featureTokens: {},
          featureCosts: {},
          featureLatencies: {},
          featureSuccessRates: {},
        };
      }
      const stat = monthMap[key];
      stat.totalCalls++;
      stat.totalTokens += log.totalTokens || 0;
      stat.totalCost += log.cost || 0;
      stat.avgLatency += log.latency || 0;
      stat.successRate += log.success ? 1 : 0;
      // feature별
      if (log.feature) {
        stat.features[log.feature] = (stat.features[log.feature] || 0) + 1;
        stat.featureTokens[log.feature] = (stat.featureTokens[log.feature] || 0) + (log.totalTokens || 0);
        stat.featureCosts[log.feature] = (stat.featureCosts[log.feature] || 0) + (log.cost || 0);
        stat.featureLatencies[log.feature] = (stat.featureLatencies[log.feature] || 0) + (log.latency || 0);
        stat.featureSuccessRates[log.feature] = (stat.featureSuccessRates[log.feature] || 0) + (log.success ? 1 : 0);
      }
    }
    // 12개월간 누락된 월도 0으로 채움
    const stats: any[] = [];
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < 12; i++) {
      const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}`;
      const stat = monthMap[key] || {
        period: key,
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        avgLatency: 0,
        successRate: 0,
        features: {},
        featureTokens: {},
        featureCosts: {},
        featureLatencies: {},
        featureSuccessRates: {},
      };
      if (stat.totalCalls > 0) {
        stat.avgLatency = stat.avgLatency / stat.totalCalls;
        stat.successRate = (stat.successRate / stat.totalCalls) * 100;
        Object.keys(stat.featureLatencies).forEach(f => {
          stat.featureLatencies[f] = stat.featureLatencies[f] / (stat.features[f] || 1);
        });
        Object.keys(stat.featureSuccessRates).forEach(f => {
          stat.featureSuccessRates[f] = (stat.featureSuccessRates[f] / (stat.features[f] || 1)) * 100;
        });
      }
      stats.push(stat);
      d.setMonth(d.getMonth() + 1);
    }
    return stats;
  }

  updateSummaryCards(stats: any[], visibleFeatures?: Set<string>) {
    if (visibleFeatures && visibleFeatures.size === 0) {
      (document.getElementById('ai-total-calls') as HTMLElement).textContent = '-';
      (document.getElementById('ai-total-tokens') as HTMLElement).textContent = '-';
      (document.getElementById('ai-total-cost') as HTMLElement).textContent = '-';
      (document.getElementById('ai-avg-latency') as HTMLElement).textContent = '-';
      (document.getElementById('ai-success-rate') as HTMLElement).textContent = '-';
      return;
    }
    let totalCalls = 0, totalTokens = 0, totalCost = 0;
    let latencySum = 0, latencyCount = 0;
    let successSum = 0, successCount = 0;
    stats.forEach(s => {
      let features = Object.keys(s.features || {});
      if (visibleFeatures && visibleFeatures.size > 0) {
        features = features.filter(f => visibleFeatures.has(f));
      }
      // 호출수, 토큰, 비용은 기존대로 합산
      let calls = features.reduce((sum, f) => sum + (s.features[f] || 0), 0);
      let tokens = features.reduce((sum, f) => sum + (s.featureTokens[f] || 0), 0);
      let cost = features.reduce((sum, f) => sum + (s.featureCosts[f] || 0), 0);
      totalCalls += calls;
      totalTokens += tokens;
      totalCost += cost;
      // 평균지연: feature별 latency * 호출수의 합 / 호출수의 합
      features.forEach(f => {
        const callCount = s.features[f] || 0;
        const latency = s.featureLatencies[f] || 0;
        latencySum += latency * callCount;
        latencyCount += callCount;
        const successRate = s.featureSuccessRates[f] || 0;
        // 성공률은 퍼센트이므로, 성공횟수 = 성공률(%) * 호출수 / 100
        successSum += (successRate * callCount) / 100;
        successCount += callCount;
      });
    });
    const avgLatency = latencyCount ? latencySum / latencyCount : 0;
    const avgSuccess = successCount ? (successSum / successCount) * 100 : 100;
    (document.getElementById('ai-total-calls') as HTMLElement).textContent = totalCalls.toLocaleString();
    (document.getElementById('ai-total-tokens') as HTMLElement).textContent = totalTokens.toLocaleString();
    (document.getElementById('ai-total-cost') as HTMLElement).textContent = totalCost.toFixed(4);
    (document.getElementById('ai-avg-latency') as HTMLElement).textContent = avgLatency.toFixed(1);
    (document.getElementById('ai-success-rate') as HTMLElement).textContent = avgSuccess.toFixed(1);
  }

  updateChart() {
    if (!this.chartArea) return;
    // 차트 영역 비울 때도 height 고정
    this.chartArea.style.height = '260px';
    this.chartArea.style.background = 'var(--background-secondary)';
    this.chartArea.style.borderRadius = '8px';
    this.chartArea.style.marginBottom = '16px';
    this.chartArea.style.display = 'flex';
    this.chartArea.style.alignItems = 'center';
    this.chartArea.style.justifyContent = 'center';
    // 기존 차트/캔버스 제거 후 새로 생성
    this.chartArea.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'ai-trend-chart';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.chartArea.appendChild(canvas);

    // 차트 데이터 준비
    let labels: string[] = [];
    let label = '';
    let features: string[] = [];
    let isStackedBar = false;
    let isScatter = false;
    let datasets: any[] = [];

    // feature 목록 추출
    if (this.summaryStats.length > 0 && this.summaryStats[0].features) {
      const allFeatures = new Set<string>();
      this.summaryStats.forEach(s => {
        Object.keys(s.features || {}).forEach(f => allFeatures.add(f));
      });
      features = Array.from(allFeatures);
    }
    labels = this.summaryStats.map(s => s.period || '');

    // 총 호출수/토큰수/비용: feature별 합이 아닌 전체 합으로 y축
    if (["totalCalls", "totalTokens", "totalCost"].includes(this.currentMetric)) {
      isStackedBar = true;
      const palette = [
        '#667eea', '#764ba2', '#4facfe', '#00f2fe', '#fa709a', '#f6d365', '#fda085', '#43e97b', '#38f9d7', '#f7971e', '#ffd200', '#f953c6', '#b91d73', '#43cea2', '#185a9d', '#f857a6', '#ff5858', '#ff9a9e', '#a18cd1', '#fbc2eb'
      ];
      datasets = features.map((f, idx) => {
        let data: number[] = this.summaryStats.map((s, i) => {
          if (this.currentMetric === 'totalCalls') return s.features?.[f] || 0;
          if (this.currentMetric === 'totalTokens') return s.featureTokens?.[f] || 0;
          if (this.currentMetric === 'totalCost') return s.featureCosts?.[f] || 0;
          return 0;
        });
        return {
          label: `${idx + 1}. ${f}`,
          data,
          backgroundColor: palette[idx % palette.length],
          borderColor: palette[idx % palette.length],
          borderWidth: 1,
        };
      });
    } else if (["avgLatency", "successRate"].includes(this.currentMetric)) {
      // 평균지연/성공률: feature별 dot scatter
      isScatter = true;
      const palette = [
        '#667eea', '#764ba2', '#4facfe', '#00f2fe', '#fa709a', '#f6d365', '#fda085', '#43e97b', '#38f9d7', '#f7971e', '#ffd200', '#f953c6', '#b91d73', '#43cea2', '#185a9d', '#f857a6', '#ff5858', '#ff9a9e', '#a18cd1', '#fbc2eb'
      ];
      datasets = features.map((f, idx) => {
        let data = this.summaryStats.map((s, i) => {
          let y = 0;
          if (this.currentMetric === 'avgLatency') y = s.featureLatencies?.[f] ?? null;
          if (this.currentMetric === 'successRate') y = s.featureSuccessRates?.[f] ?? null;
          // x축을 s.period(문자열, 예: '0시', '1시' 등)로 통일
          let x = s.period;
          return y != null ? { x, y } : null;
        }).filter(v => v !== null);
        return {
          label: `${idx + 1}. ${f}`,
          data,
          showLine: false,
          pointBackgroundColor: palette[idx % palette.length],
          pointBorderColor: palette[idx % palette.length],
          pointRadius: 6,
          type: 'scatter',
        };
      });
      label = this.currentMetric === 'avgLatency' ? '평균 지연(ms)' : '성공률(%)';
    } else if (this.currentMetric === 'totalTokens') {
      // 총 토큰수: y축을 각 기간별 모든 feature의 토큰 합의 최대값으로 고정
      isStackedBar = true;
      const palette = [
        '#667eea', '#764ba2', '#4facfe', '#00f2fe', '#fa709a', '#f6d365', '#fda085', '#43e97b', '#38f9d7', '#f7971e', '#ffd200', '#f953c6', '#b91d73', '#43cea2', '#185a9d', '#f857a6', '#ff5858', '#ff9a9e', '#a18cd1', '#fbc2eb'
      ];
      // feature별 데이터
      datasets = features.map((f, idx) => {
        let data: number[] = this.summaryStats.map(s => s.featureTokens?.[f] || 0);
        return {
          label: `${idx + 1}. ${f}`,
          data,
          backgroundColor: palette[idx % palette.length],
          borderColor: palette[idx % palette.length],
          borderWidth: 1,
          stack: 'features',
        };
      });
      label = '총 토큰수';
      // y축 최대값 계산 (각 기간별 feature 토큰 합의 최대값)
      const maxY = Math.max(...this.summaryStats.map(s => {
        return features.reduce((sum, f) => sum + (s.featureTokens?.[f] || 0), 0);
      }), 10);
      // 기존 차트 제거
      if (this.chart) {
        this.chart.destroy();
        this.chart = null;
      }
      if ((window as any).Chart && canvas) {
        this.chart = new (window as any).Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive: true,
            plugins: {
              // legend: { display: true, position: 'bottom' },
              title: { display: false },
              legend: {
                display: true,
                position: 'bottom',
                onClick: (_e: any, legendItem: any, legend: any) => {
                  // Default toggle
                  const ci = legend.chart;
                  const index = legendItem.datasetIndex;
                  const meta = ci.getDatasetMeta(index);
                  meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                  ci.update();

                  // Update visibleFeatures set
                  this.visibleFeatures = new Set(
                    ci.data.datasets
                      .map((ds: any, i: number) => !ci.getDatasetMeta(i).hidden ? ds.label.replace(/^[0-9]+\. /, '') : null)
                      .filter((f: any) => f)
                  );
                  this.updateSummaryCards(this.summaryStats, this.visibleFeatures);
                }
              }              
            },
            scales: {
              x: { title: { display: true, text: '기간' }, stacked: true },
              y: { beginAtZero: true, title: { display: true, text: label }, stacked: true, max: maxY },
            },
          },
        });
      }
      return;
    }

    // 기존 차트 제거
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if ((window as any).Chart && canvas) {
      if (isStackedBar) {
        this.chart = new (window as any).Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive: true,
            plugins: {
              // legend: { display: true, position: 'bottom' },
              title: { display: false },
              legend: {
                display: true,
                position: 'bottom',
                onClick: (_e: any, legendItem: any, legend: any) => {
                  // Default toggle
                  const ci = legend.chart;
                  const index = legendItem.datasetIndex;
                  const meta = ci.getDatasetMeta(index);
                  meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                  ci.update();

                  // Update visibleFeatures set
                  this.visibleFeatures = new Set(
                    ci.data.datasets
                      .map((ds: any, i: number) => !ci.getDatasetMeta(i).hidden ? ds.label.replace(/^[0-9]+\. /, '') : null)
                      .filter((f: any) => f)
                  );
                  this.updateSummaryCards(this.summaryStats, this.visibleFeatures);
                }
              }              
            },
            scales: {
              x: { title: { display: true, text: '기간' }, stacked: true },
              y: { beginAtZero: true, title: { display: true, text: label }, stacked: true },
            },
          },
        });
      } else if (isScatter) {
        this.chart = new (window as any).Chart(canvas.getContext('2d'), {
          type: 'scatter',
          data: { labels, datasets },
          options: {
            responsive: true,
            plugins: {
              // legend: { display: true, position: 'bottom' },
              title: { display: false },
              legend: {
                display: true,
                position: 'bottom',
                onClick: (_e: any, legendItem: any, legend: any) => {
                  // Default toggle
                  const ci = legend.chart;
                  const index = legendItem.datasetIndex;
                  const meta = ci.getDatasetMeta(index);
                  meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                  ci.update();

                  // Update visibleFeatures set
                  this.visibleFeatures = new Set(
                    ci.data.datasets
                      .map((ds: any, i: number) => !ci.getDatasetMeta(i).hidden ? ds.label.replace(/^[0-9]+\. /, '') : null)
                      .filter((f: any) => f)
                  );
                  this.updateSummaryCards(this.summaryStats, this.visibleFeatures);
                }
              },
              tooltip: {
                callbacks: {
                  title: (items: any[]) => {
                    // items[0].raw.x는 period 문자열임
                    const period = items[0].raw.x;
                    // 기간 문자열을 시스템 locale 시간으로 변환
                    // hourly: '0시', '1시' ... daily: 'YYYY-MM-DD', weekly: 'YYYY-W##', monthly: 'YYYY-MM'
                    if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
                      // daily
                      const d = new Date(period);
                      return d.toLocaleDateString();
                    } else if (/^\d{4}-\d{2}$/.test(period)) {
                      // monthly
                      const [y, m] = period.split('-');
                      const d = new Date(Number(y), Number(m) - 1, 1);
                      return d.toLocaleString(undefined, { year: 'numeric', month: 'long' });
                    } else if (/^\d{4}-W\d{2}$/.test(period)) {
                      // weekly (ISO week)
                      const [y, w] = period.split('-W');
                      // ISO week -> date (월요일)
                      const simple = (y: number, w: number) => {
                        const d = new Date(Number(y), 0, 1 + (Number(w) - 1) * 7);
                        // 보정: 해당 주의 월요일 찾기
                        const day = d.getDay();
                        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                        return new Date(d.setDate(diff));
                      };
                      const monday = simple(Number(y), Number(w));
                      return `${monday.toLocaleDateString()} (주 시작)`;
                    } else if (/^\d+시$/.test(period)) {
                      // hourly
                      const hour = Number(period.replace('시', ''));
                      const now = new Date();
                      now.setHours(hour, 0, 0, 0);
                      return now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    }
                    return period;
                  }
                }
              }
            },
            scales: {
              x: {
                title: { display: true, text: '기간' },
                type: 'category',
                labels,
                ticks: { callback: (v: any, i: number) => labels[i] },
              },
              y: { beginAtZero: true, title: { display: true, text: label } },
            },
          },
        });
      }
    }
  }

//   // 주간/월간 집계 함수 (일간 통계를 합산)
//   async aggregateWeeklyStats(weeks: number): Promise<any[]> {
//     // 최근 N주간의 일간 통계 fetch 후 주간별로 합산
//     const days = weeks * 7;
//     const daily = await this.plugin.dbManager.getDailyStats(days);
//     const weekStats: any[] = [];
//     for (let i = 0; i < weeks; i++) {
//       const week = daily.slice(i * 7, (i + 1) * 7);
//       if (week.length === 0) continue;
//       weekStats.push({
//         period: `${week[0].period}~${week[week.length - 1].period}`,
//         totalCalls: week.reduce((a, b) => a + (b.totalCalls || 0), 0),
//         totalTokens: week.reduce((a, b) => a + (b.totalTokens || 0), 0),
//         totalCost: week.reduce((a, b) => a + (b.totalCost || 0), 0),
//         avgLatency: week.reduce((a, b) => a + ((b.avgLatency || 0) * (b.totalCalls || 1)), 0) / (week.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
//         successRate: week.reduce((a, b) => a + ((b.successRate || 0) * (b.totalCalls || 1)), 0) / (week.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
//       });
//     }
//     return weekStats;
//   }

//   async aggregateMonthlyStats(months: number): Promise<any[]> {
//     // 최근 N개월의 일간 통계 fetch 후 월별로 합산
//     const days = months * 31;
//     const daily = await this.plugin.dbManager.getDailyStats(days);
//     const monthMap: Record<string, any[]> = {};
//     daily.forEach(d => {
//       const [m, d1] = (d.period || '').split('/');
//       if (!m) return;
//       if (!monthMap[m]) monthMap[m] = [];
//       monthMap[m].push(d);
//     });
//     const monthStats: any[] = [];
//     Object.entries(monthMap).slice(-months).forEach(([m, arr]) => {
//       monthStats.push({
//         period: `${m}월`,
//         totalCalls: arr.reduce((a, b) => a + (b.totalCalls || 0), 0),
//         totalTokens: arr.reduce((a, b) => a + (b.totalTokens || 0), 0),
//         totalCost: arr.reduce((a, b) => a + (b.totalCost || 0), 0),
//         avgLatency: arr.reduce((a, b) => a + ((b.avgLatency || 0) * (b.totalCalls || 1)), 0) / (arr.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
//         successRate: arr.reduce((a, b) => a + ((b.successRate || 0) * (b.totalCalls || 1)), 0) / (arr.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
//       });
//     });
//     return monthStats;
//   }

  close() {
    if (this.modalBg) {
      this.modalBg.removeEventListener('mousedown', this.handleBgClick);
      window.removeEventListener('keydown', this.handleEscKey);       
      this.modalBg.remove();
      this.modalBg = null;
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

}

// ISO week number 계산 함수
function getWeekNumber(d: Date): number {
  // 로컬 타임존 기준으로 주차 계산
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date as any) - (yearStart as any)) / 86400000 + 1) / 7);
}
