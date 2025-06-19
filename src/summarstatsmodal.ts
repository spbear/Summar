import { Plugin } from "obsidian";
import SummarPlugin from "./main";
import { IndexedDBManager } from "./summarailog";

export class SummarStatsModal {
  private plugin: SummarPlugin;
//   private dbManager: IndexedDBManager;
  private modalBg: HTMLDivElement | null = null;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
    // @ts-ignore
    // this.dbManager = plugin.dbManager;
  }

  async open() {
    // 모달 배경
    this.modalBg = document.createElement('div');
    this.modalBg.style.position = 'fixed';
    this.modalBg.style.top = '0';
    this.modalBg.style.left = '0';
    this.modalBg.style.width = '100vw';
    this.modalBg.style.height = '100vh';
    this.modalBg.style.background = 'rgba(0,0,0,0.3)';
    this.modalBg.style.zIndex = '9999';
    this.modalBg.onclick = () => this.close();

    // 모달 컨테이너
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

    // 헤더
    const header = document.createElement('div');
    header.innerHTML = '<b>AI API 통계 대시보드</b>';
    header.style.fontSize = '1.5em';
    header.style.marginBottom = '16px';
    modal.appendChild(header);

    // 기간 선택 탭
    const periodTabs = document.createElement('div');
    periodTabs.style.display = 'flex';
    periodTabs.style.gap = '8px';
    periodTabs.style.marginBottom = '16px';
    [
      { label: '일별', value: 'daily' },
      { label: '주간', value: 'weekly' },
      { label: '월간', value: 'monthly' }
    ].forEach(tab => {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      btn.style.padding = '6px 16px';
      btn.style.borderRadius = '6px';
      btn.style.border = '1px solid var(--background-modifier-border)';
      btn.style.background = 'var(--background-secondary)';
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        // TODO: 기간별 통계 갱신
      };
      periodTabs.appendChild(btn);
    });
    modal.appendChild(periodTabs);

    // 요약 카드 영역
    const summaryCards = document.createElement('div');
    summaryCards.style.display = 'flex';
    summaryCards.style.gap = '16px';
    summaryCards.style.marginBottom = '24px';
    summaryCards.innerHTML = `
      <div style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;">
        <div>총 호출수</div><div id="ai-total-calls" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;">
        <div>총 토큰수</div><div id="ai-total-tokens" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;">
        <div>총 비용($)</div><div id="ai-total-cost" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;">
        <div>평균 지연(ms)</div><div id="ai-avg-latency" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
      <div style="flex:1;background:var(--background-secondary);padding:16px;border-radius:8px;text-align:center;">
        <div>성공률(%)</div><div id="ai-success-rate" style="font-size:1.3em;font-weight:bold;">-</div>
      </div>
    `;
    modal.appendChild(summaryCards);

    // 트렌드 차트/비용 분포/기능별/제공업체별 등 영역(placeholder)
    const chartArea = document.createElement('div');
    chartArea.style.height = '260px';
    chartArea.style.background = 'var(--background-secondary)';
    chartArea.style.borderRadius = '8px';
    chartArea.style.marginBottom = '16px';
    chartArea.style.display = 'flex';
    chartArea.style.alignItems = 'center';
    chartArea.style.justifyContent = 'center';
    chartArea.innerHTML = '<span style="color:var(--text-faint)">[트렌드 차트 영역]</span>';
    modal.appendChild(chartArea);

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

    // 통계 데이터 불러오기 및 UI 갱신
    if (this.plugin.dbManager) {
      this.plugin.dbManager.getStats().then(stats => {
        (document.getElementById('ai-total-calls') as HTMLElement).textContent = stats.totalLogs;
        (document.getElementById('ai-total-tokens') as HTMLElement).textContent = stats.totalTokens;
        (document.getElementById('ai-total-cost') as HTMLElement).textContent = stats.totalCost.toFixed(4);
        (document.getElementById('ai-avg-latency') as HTMLElement).textContent = stats.avgLatency.toFixed(1);
        (document.getElementById('ai-success-rate') as HTMLElement).textContent = stats.successRate.toFixed(1);
      });
    }
  }

  close() {
    if (this.modalBg) {
      this.modalBg.remove();
      this.modalBg = null;
    }
  }
}
