// popup.js

const scanBtn = document.getElementById('scanBtn');
const minViewsInput = document.getElementById('minViews');
const statusEl = document.getElementById('status');
const tbody = document.querySelector('#resultTable tbody');
const exportText = document.getElementById('exportText');
const copyMarkdownBtn = document.getElementById('copyMarkdownBtn');
const copyCsvBtn = document.getElementById('copyCsvBtn');
const copySimpleBtn = document.getElementById('copySimpleBtn');

let lastData = [];

// ---- Helpers ----

function formatNumber(n) {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US');
}

function renderTable(list) {
  tbody.innerHTML = '';

  list.forEach((item, i) => {
    const tr = document.createElement('tr');

    const tdIdx = document.createElement('td');
    tdIdx.textContent = String(i + 1);

    const tdViews = document.createElement('td');
    tdViews.textContent = formatNumber(item.views);

    const tdRaw = document.createElement('td');
    tdRaw.textContent = item.rawText;

    const tdUrl = document.createElement('td');
    tdUrl.textContent = item.url;

    tr.appendChild(tdIdx);
    tr.appendChild(tdViews);
    tr.appendChild(tdRaw);
    tr.appendChild(tdUrl);

    tbody.appendChild(tr);
  });
}

function buildMarkdown(list) {
  let md = '## FB Reels (filtered)\n\n';
  md += '| # | Views | Raw | URL |\n';
  md += '|---|------:|-----|-----|\n';

  list.forEach((item, i) => {
    md += `| ${i + 1} | ${formatNumber(item.views)} | ${item.rawText} | ${item.url} |\n`;
  });

  return md;
}

function buildCsv(list) {
  let csv = 'index,views,rawText,url\n';

  list.forEach((item) => {
    const row = [
      item.index,
      item.views,
      `"${(item.rawText || '').replace(/"/g, '""')}"`,
      `"${(item.url || '').replace(/"/g, '""')}"`,
    ];
    csv += row.join(',') + '\n';
  });

  return csv;
}

// Dạng đơn giản: URL,Views (để dán thẳng vào Google Sheets)
function buildSimple(list) {
  // Nếu Google Sheets của bạn dùng ; làm separator,
  // có thể đổi dấu phẩy dưới đây thành ;
  return list.map((item) => `${item.url},${item.views}`).join('\n');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = 'Copied to clipboard.';
  } catch (e) {
    statusEl.textContent = 'Copy failed. You can select and copy manually.';
    console.error('Clipboard error:', e);
  }
}

// ---- Events ----

scanBtn.addEventListener('click', () => {
  statusEl.textContent = 'Scanning...';

  const minViews = parseInt(minViewsInput.value || '0', 10) || 0;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      statusEl.textContent = 'No active tab.';
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'SCAN_REELS', minViews },
      (response) => {
        if (chrome.runtime.lastError) {
          statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
          console.error(chrome.runtime.lastError);
          return;
        }

        if (!response) {
          statusEl.textContent = 'No response from content script.';
          return;
        }

        const { total, filtered } = response;
        lastData = filtered || [];

        renderTable(lastData);

        statusEl.textContent = `Found ${lastData.length} / ${total} reels (views >= ${minViews}).`;

        const md = buildMarkdown(lastData);
        exportText.value = md;

        const disabled = lastData.length === 0;
        copyMarkdownBtn.disabled = disabled;
        copyCsvBtn.disabled = disabled;
        copySimpleBtn.disabled = disabled;
      }
    );
  });
});

copyMarkdownBtn.addEventListener('click', () => {
  const md = buildMarkdown(lastData);
  exportText.value = md;
  copyToClipboard(md);
});

copyCsvBtn.addEventListener('click', () => {
  const csv = buildCsv(lastData);
  exportText.value = csv;
  copyToClipboard(csv);
});

copySimpleBtn.addEventListener('click', () => {
  const simple = buildSimple(lastData);
  exportText.value = simple;
  copyToClipboard(simple);
});
