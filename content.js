// content.js

function parseViews(text) {
  if (!text) return 0;
  const lower = text.toLowerCase().trim(); // "3.1m", "275k"
  const match = lower.match(/([\d.,]+)\s*([km]?)/i);
  if (!match) return 0;

  let value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2];

  if (unit === 'k') value *= 1000;
  if (unit === 'm') value *= 1000000;

  return value || 0;
}

function scanReels(minViews = 0) {
  const reelLinks = Array.from(
    document.querySelectorAll('a[aria-label="Reel tile preview"]')
  );
  const origin = location.origin;

  const data = reelLinks.map((a, idx) => {
    const innerSpans = a.querySelectorAll('span');
    let rawText = '';

    for (const s of innerSpans) {
      const t = (s.innerText || '').trim();
      // dạng "3.1M", "275K", "2M"...
      if (/^\d[\d.,]*\s*[kKmM]?$/.test(t)) {
        rawText = t;
        break;
      }
    }

    const views = parseViews(rawText);
    const href = a.href || a.getAttribute('href') || '';
    const url = href.startsWith('http') ? href : origin + href;

    return { index: idx, views, rawText, url };
  });

  const filtered = data
    .filter((item) => item.views >= minViews)
    .sort((a, b) => b.views - a.views);

  return { total: data.length, filtered };
}

// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCAN_REELS') {
    const minViews = message.minViews ?? 0;
    const result = scanReels(minViews);
    sendResponse(result);
  }
  return true; // Bắt buộc với Manifest V3 để giữ channel message mở
});
