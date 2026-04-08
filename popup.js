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

function buildSimple(list) {
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

// Hàm scan chạy trực tiếp trong page context (inject qua scripting API)
function scanReelsInPage(minViews) {
  function parseViews(text) {
    if (!text) return 0;
    // Bỏ các ký tự rác ẩn (nếu có) và chữ viết hoa
    const lower = text.replace(/[\u200E\u200F\u202A-\u202E]/g, '').toLowerCase().trim();
    // Bắt số (có phẩy/chấm) và đơn vị (k, m, triệu)
    const match = lower.match(/(^|\s)([\d,.]+)\s*([km]|triệu)?(\s|$)/i);
    if (!match) return 0;
    
    let numStr = match[2];
    // Đổi dấu phẩy thành dấu chấm để parse thành số thập phân chính xác (VD: 1,4 -> 1.4)
    numStr = numStr.replace(',', '.');
    
    let value = parseFloat(numStr);
    if (isNaN(value)) return 0;

    const unit = (match[3] || '').trim();
    if (unit === 'k') value *= 1000;
    if (unit === 'm' || unit === 'triệu') value *= 1000000;

    return Math.floor(value);
  }

  const reelLinks = Array.from(document.querySelectorAll('a'));
  const origin = location.origin;
  const dataMap = new Map();

  reelLinks.forEach((a) => {
    let href = a.getAttribute('href') || '';
    if (href === '#' || href.startsWith('javascript:')) return;

    const innerSpans = a.querySelectorAll('span');
    let rawText = '';
    
    // Tìm span chứa nội dung là lượt xem (VD: 1,4K, 581, 1 triệu)
    for (const s of innerSpans) {
      // Dọn dẹp khoảng trắng và ký tự định dạng
      const spanText = (s.innerText || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
      if (/^[\d,.]+\s*([kKmM]|triệu)?$/.test(spanText)) {
        rawText = spanText;
        break; // Tìm thấy thì dừng vòng lặp span
      }
    }

    if (rawText) {
      const views = parseViews(rawText);
      if (views > 0) {
        let url = href.startsWith('http') ? href : origin + href;
        
        // Loại bỏ các query parameter không cần thiết để nhóm URL
        try {
          const urlObj = new URL(url);
          urlObj.searchParams.delete('__cft__[0]');
          urlObj.searchParams.delete('__tn__');
          urlObj.searchParams.delete('mibextid');
          url = urlObj.href;
        } catch (e) {
          // ignore error
        }

        // Lưu vào Map để chống trùng lặp link
        if (!dataMap.has(url)) {
          dataMap.set(url, { views, rawText, url });
        }
      }
    }
  });

  const data = Array.from(dataMap.values()).map((item, idx) => {
    item.index = idx;
    return item;
  });

  const filtered = data
    .filter((item) => item.views >= minViews)
    .sort((a, b) => b.views - a.views);

  return { total: data.length, filtered };
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

    // Inject trực tiếp vào page — không cần content script đã load sẵn
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: scanReelsInPage,
        args: [minViews],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
          console.error(chrome.runtime.lastError);
          return;
        }

        if (!results || !results[0] || !results[0].result) {
          statusEl.textContent = 'No results. Make sure you are on a Facebook Reels page.';
          return;
        }

        const { total, filtered } = results[0].result;
        lastData = filtered || [];

        renderTable(lastData);
        statusEl.textContent = `Found ${lastData.length} / ${total} reels (views >= ${minViews.toLocaleString()}).`;

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
