import { Plugin } from "obsidian";
import SummarPlugin from "./main";
import { IndexedDBManager } from "./summarailog";

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
  private currentPeriod: 'daily' | 'weekly' | 'monthly' = 'daily';
  private currentMetric: 'totalCalls' | 'totalTokens' | 'totalCost' | 'avgLatency' | 'successRate' = 'totalCalls';
  private periodButtons: Record<string, HTMLButtonElement> = {};
  private metricDivs: Record<string, HTMLDivElement> = {};
  private chartArea: HTMLDivElement | null = null;
  private summaryStats: any[] = [];

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
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

    const modal = document.createElement('div');
    modal.style.position = 'absolute';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.background = 'var(--background-primary)';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 4px 32px rgba(0,0,0,0.2)';
    modal.style.padding = '32px 24px';
    modal.style.minWidth = '600px';
    modal.style.maxWidth = '90vw';
    modal.style.maxHeight = '80vh';
    modal.style.overflowY = 'auto';
    this.modalBg.appendChild(modal);

    // 헤더 + 닫기 버튼
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '16px';
    
    const title = document.createElement('span');
    title.innerHTML = '<b>AI API 통계 대시보드</b>';
    title.style.fontSize = '1.5em';
    header.appendChild(title);

    // 닫기 버튼
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
    modal.appendChild(header);

    // 기간 선택 탭
    const periodTabs = document.createElement('div');
    periodTabs.style.display = 'flex';
    periodTabs.style.gap = '8px';
    periodTabs.style.marginBottom = '16px';
    const periods: [string, string, number][] = [
      ['일별', 'daily', 7],
      ['주간', 'weekly', 8],
      ['월간', 'monthly', 6],
    ];
    periods.forEach(([label, value]) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.padding = '6px 16px';
      btn.style.borderRadius = '6px';
      btn.style.border = '1px solid var(--background-modifier-border)';
      btn.style.background = 'var(--background-secondary)';
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        this.setPeriod(value as any);
      };
      this.periodButtons[value] = btn;
      periodTabs.appendChild(btn);
    });
    modal.appendChild(periodTabs);

    // 요약 카드 영역
    const summaryCards = document.createElement('div');
    summaryCards.style.display = 'flex';
    summaryCards.style.gap = '16px';
    summaryCards.style.marginBottom = '24px';
    summaryCards.innerHTML = `
      <div id="ai-card-totalCalls" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
        <div>총 호출수</div><div id="ai-total-calls" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div id="ai-card-totalTokens" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
        <div>총 토큰수</div><div id="ai-total-tokens" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div id="ai-card-totalCost" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
        <div>총 비용($)</div><div id="ai-total-cost" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div id="ai-card-avgLatency" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
        <div>평균 지연(ms)</div><div id="ai-avg-latency" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div id="ai-card-successRate" style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;cursor:pointer;">
        <div>성공률(%)</div><div id="ai-success-rate" style="font-size:1.3em;font-weight:bold;">-</div>
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
      };
    });

    // 차트 영역
    this.chartArea = document.createElement('div');
    this.chartArea.style.height = '260px';
    this.chartArea.style.background = 'var(--background-secondary)';
    this.chartArea.style.borderRadius = '8px';
    this.chartArea.style.marginBottom = '16px';
    this.chartArea.style.display = 'flex';
    this.chartArea.style.alignItems = 'center';
    this.chartArea.style.justifyContent = 'center';
    this.chartArea.innerHTML = '<canvas id="ai-trend-chart" style="width:100%;height:100%"></canvas>';
    modal.appendChild(this.chartArea);

    // 내보내기/비교/예측/알림 등 고급 기능 버튼(placeholder)
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '12px';
    actions.style.marginTop = '12px';
    actions.innerHTML = `
      <button id="ai-export-csv">CSV 내보내기</button>
      <button id="ai-export-json">JSON 내보내기</button>
      <button id="ai-compare-period">기간 비교</button>
      <button id="ai-predict">예측분석</button>
    `;
    modal.appendChild(actions);

    document.body.appendChild(this.modalBg);

    // 디폴트: 일별, 총호출수
    this.setPeriod('daily');
  }

  async setPeriod(period: 'daily' | 'weekly' | 'monthly') {
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
  }

  async updateStatsAndChart() {
    // 기간별 데이터 fetch
    let stats: any[] = [];
    if (this.plugin.dbManager) {
      if (this.currentPeriod === 'daily') {
        stats = await this.plugin.dbManager.getDailyStats(7);
      } else if (this.currentPeriod === 'weekly') {
        stats = await this.aggregateWeeklyStats(8);
      } else if (this.currentPeriod === 'monthly') {
        stats = await this.aggregateMonthlyStats(6);
      }
    }
    this.summaryStats = stats;
    // 요약 카드 업데이트
    this.updateSummaryCards(stats);
    // 차트 업데이트
    this.setMetric(this.currentMetric); // metric 스타일 및 차트 갱신
  }

  updateSummaryCards(stats: any[]) {
    // 합계/평균 계산
    let totalCalls = 0, totalTokens = 0, totalCost = 0, latencySum = 0, successSum = 0;
    stats.forEach(s => {
      totalCalls += s.totalCalls || 0;
      totalTokens += s.totalTokens || 0;
      totalCost += s.totalCost || 0;
      latencySum += (s.avgLatency || 0) * (s.totalCalls || 1);
      successSum += (s.successRate || 0) * (s.totalCalls || 1);
    });
    const total = stats.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1;
    const avgLatency = total ? latencySum / total : 0;
    const avgSuccess = total ? successSum / total : 100;
    (document.getElementById('ai-total-calls') as HTMLElement).textContent = totalCalls.toLocaleString();
    (document.getElementById('ai-total-tokens') as HTMLElement).textContent = totalTokens.toLocaleString();
    (document.getElementById('ai-total-cost') as HTMLElement).textContent = totalCost.toFixed(4);
    (document.getElementById('ai-avg-latency') as HTMLElement).textContent = avgLatency.toFixed(1);
    (document.getElementById('ai-success-rate') as HTMLElement).textContent = avgSuccess.toFixed(1);
  }

  updateChart() {
    if (!this.chartArea) return;
    const canvas = this.chartArea.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    // 차트 데이터 준비
    let labels: string[] = [];
    let data: number[] = [];
    let label = '';
    let featureGroups: Record<string, number[]> = {};
    let features: string[] = [];
    let isFeatureChart = false;
    // feature별 데이터가 있는 경우(예: 기능별 호출수 등)
    if (this.currentMetric === 'totalCalls' && this.summaryStats.length > 0 && this.summaryStats[0].features) {
      isFeatureChart = true;
      // feature 목록 추출
      const allFeatures = new Set<string>();
      this.summaryStats.forEach(s => {
        Object.keys(s.features || {}).forEach(f => allFeatures.add(f));
      });
      features = Array.from(allFeatures);
      // feature별로 데이터 배열 생성
      featureGroups = {};
      features.forEach(f => {
        featureGroups[f] = this.summaryStats.map(s => (s.features && s.features[f]) ? s.features[f] : 0);
      });
      labels = this.summaryStats.map(s => s.period || '');
      label = '기능별 호출수';
    } else {
      // 기존 단일 metric
      if (this.summaryStats.length > 0) {
        labels = this.summaryStats.map(s => s.period || '');
        data = this.summaryStats.map(s => {
          if (this.currentMetric === 'totalCalls') return s.totalCalls || 0;
          if (this.currentMetric === 'totalTokens') return s.totalTokens || 0;
          if (this.currentMetric === 'totalCost') return s.totalCost || 0;
          if (this.currentMetric === 'avgLatency') return s.avgLatency || 0;
          if (this.currentMetric === 'successRate') return s.successRate || 0;
          return 0;
        });
        label = {
          totalCalls: '총 호출수',
          totalTokens: '총 토큰수',
          totalCost: '총 비용($)',
          avgLatency: '평균 지연(ms)',
          successRate: '성공률(%)',
        }[this.currentMetric];
      }
    }
    // 기존 차트 제거
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if ((window as any).Chart && canvas) {
      if (isFeatureChart && features.length > 0) {
        // feature별 색상 팔레트
        const palette = [
          '#667eea', '#764ba2', '#4facfe', '#00f2fe', '#fa709a', '#f6d365', '#fda085', '#43e97b', '#38f9d7', '#f7971e', '#ffd200', '#f953c6', '#b91d73', '#43cea2', '#185a9d', '#f857a6', '#ff5858', '#ff9a9e', '#a18cd1', '#fbc2eb'
        ];
        const datasets = features.map((f, idx) => ({
          label: `${idx + 1}. ${f}`,
          data: featureGroups[f],
          backgroundColor: palette[idx % palette.length],
          borderColor: palette[idx % palette.length],
          borderWidth: 1,
        }));
        this.chart = new (window as any).Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels,
            datasets,
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: false },
            },
            scales: {
              x: { title: { display: true, text: '기간' } },
              y: { beginAtZero: true, title: { display: true, text: label } },
            },
          },
        });
      } else {
        // 단일 metric 차트
        this.chart = new (window as any).Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label,
              data,
              backgroundColor: 'rgba(102, 126, 234, 0.7)',
              borderColor: '#667eea',
              borderWidth: 1,
            }],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              title: { display: false },
            },
            scales: {
              x: { title: { display: true, text: '기간' } },
              y: { beginAtZero: true, title: { display: true, text: label } },
            },
          },
        });
      }
    }
  }

  // 주간/월간 집계 함수 (일별 통계를 합산)
  async aggregateWeeklyStats(weeks: number): Promise<any[]> {
    // 최근 N주간의 일별 통계 fetch 후 주간별로 합산
    const days = weeks * 7;
    const daily = await this.plugin.dbManager.getDailyStats(days);
    const weekStats: any[] = [];
    for (let i = 0; i < weeks; i++) {
      const week = daily.slice(i * 7, (i + 1) * 7);
      if (week.length === 0) continue;
      weekStats.push({
        period: `${week[0].period}~${week[week.length - 1].period}`,
        totalCalls: week.reduce((a, b) => a + (b.totalCalls || 0), 0),
        totalTokens: week.reduce((a, b) => a + (b.totalTokens || 0), 0),
        totalCost: week.reduce((a, b) => a + (b.totalCost || 0), 0),
        avgLatency: week.reduce((a, b) => a + ((b.avgLatency || 0) * (b.totalCalls || 1)), 0) / (week.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
        successRate: week.reduce((a, b) => a + ((b.successRate || 0) * (b.totalCalls || 1)), 0) / (week.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
      });
    }
    return weekStats;
  }

  async aggregateMonthlyStats(months: number): Promise<any[]> {
    // 최근 N개월의 일별 통계 fetch 후 월별로 합산
    const days = months * 31;
    const daily = await this.plugin.dbManager.getDailyStats(days);
    const monthMap: Record<string, any[]> = {};
    daily.forEach(d => {
      const [m, d1] = (d.period || '').split('/');
      if (!m) return;
      if (!monthMap[m]) monthMap[m] = [];
      monthMap[m].push(d);
    });
    const monthStats: any[] = [];
    Object.entries(monthMap).slice(-months).forEach(([m, arr]) => {
      monthStats.push({
        period: `${m}월`,
        totalCalls: arr.reduce((a, b) => a + (b.totalCalls || 0), 0),
        totalTokens: arr.reduce((a, b) => a + (b.totalTokens || 0), 0),
        totalCost: arr.reduce((a, b) => a + (b.totalCost || 0), 0),
        avgLatency: arr.reduce((a, b) => a + ((b.avgLatency || 0) * (b.totalCalls || 1)), 0) / (arr.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
        successRate: arr.reduce((a, b) => a + ((b.successRate || 0) * (b.totalCalls || 1)), 0) / (arr.reduce((a, b) => a + (b.totalCalls || 0), 0) || 1),
      });
    });
    return monthStats;
  }

  close() {
    if (this.modalBg) {
      this.modalBg.remove();
      this.modalBg = null;
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
