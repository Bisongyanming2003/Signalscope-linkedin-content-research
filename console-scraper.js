/**
 * LinkedIn company-post collector (run in Chrome DevTools Console).
 * Scope: visible public company posts only. No login or engagement automation.
 */
(async () => {
  'use strict';

  // All LinkedIn DOM selectors live here. Add new candidates when the UI changes.
  const SELECTORS = {
    post: [
      'div.feed-shared-update-v2',
      'div[data-urn^="urn:li:activity:"]',
      'div[data-id^="urn:li:activity:"]',
      'article[data-urn^="urn:li:activity:"]',
      'article[data-id^="urn:li:activity:"]'
    ],
    text: [
      '.feed-shared-update-v2__description .update-components-text',
      '.feed-shared-update-v2__description .break-words',
      '.feed-shared-text',
      '.update-components-text',
      '[data-test-id="main-feed-activity-card__commentary"]'
    ],
    dateLink: [
      'a[href*="/feed/update/urn:li:activity:"]',
      'a[href*="/posts/"]',
      'a.app-aware-link[href*="activity"]',
      'time a',
      'a time'
    ],
    date: ['time', '.update-components-actor__sub-description', '.feed-shared-actor__sub-description'],
    seeMore: [
      'button.feed-shared-inline-show-more-text__see-more-less-toggle',
      'button[aria-label*="see more" i]',
      'button[aria-label*="查看更多"]',
      '.feed-shared-inline-show-more-text button'
    ],
    reactions: [
      '.social-details-social-counts__reactions-count',
      '.social-details-social-counts__social-proof-text',
      '.social-details-social-counts button[aria-label*="reaction" i]',
      '.social-details-social-counts button[aria-label*="回应"]',
      'button[aria-label*="reaction count" i]',
      'button[aria-label*="回应数量"]'
    ],
    comments: [
      'button[aria-label*="comment" i]',
      'button[aria-label*="评论"]',
      'li.social-details-social-counts__comments',
      'a[href*="comments"]'
    ],
    reposts: [
      'button[aria-label*="repost" i]',
      'button[aria-label*="转发"]',
      'li.social-details-social-counts__item--right-aligned',
      'button[aria-label*="share" i]'
    ],
    loginOrLimit: [
      'form[action*="login"]',
      'input[name="session_key"]',
      '.checkpoint__container',
      '#captcha-internal',
      '[data-test-id="challenge-page"]'
    ],
    promoted: [
      '.feed-shared-actor__sub-description [aria-label*="Promoted" i]',
      '.update-components-actor__sub-description [aria-label*="Promoted" i]',
      '[data-test-id*="promoted"]'
    ],
    media: {
      video: ['video', '.update-components-video', '[data-test-id*="video"]'],
      document: ['.update-components-document', 'iframe[src*="document"]', '[data-test-id*="document"]'],
      carousel: ['.update-components-carousel', '[data-test-id*="carousel"]', '[aria-label*="carousel" i]'],
      image: ['.update-components-image img', '.feed-shared-image img', 'img[src*="media"]'],
      link: ['.update-components-article', '.feed-shared-article', 'a[href] img']
    }
  };

  const LINKEDIN_AUDIT_CONFIG_20260713 = {
    maxPosts: 100,
    minWaitMs: 2000,
    maxWaitMs: 4000,
    maxIdleScrolls: 7
  };
  const errors = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitRandom = () => sleep(
    LINKEDIN_AUDIT_CONFIG_20260713.minWaitMs +
    Math.random() * (LINKEDIN_AUDIT_CONFIG_20260713.maxWaitMs - LINKEDIN_AUDIT_CONFIG_20260713.minWaitMs)
  );
  const first = (root, candidates) => candidates.map(s => root.querySelector(s)).find(Boolean) || null;
  const allPosts = () => {
    const candidates = [...new Set(SELECTORS.post.flatMap(s => [...document.querySelectorAll(s)]))];
    // Prefer the outer activity container when multiple selectors match nested nodes.
    return candidates.filter(node => !candidates.some(other => other !== node && other.contains(node)))
      .filter(node => !SELECTORS.promoted.some(s => node.querySelector(s)));
  };
  const clean = value => (value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const textOf = el => clean(el?.innerText || el?.textContent || '');
  const splitPostText = value => {
    const raw = clean(value);
    const tags = [...new Set(raw.match(/#[\p{L}\p{N}_-]+/gu) || [])];
    return { raw, text: clean(raw.replace(/#[\p{L}\p{N}_-]+/gu, ' ')), hashtags: tags.join(' ') };
  };

  function estimateDate(raw, collectedAt) {
    const value = clean(raw);
    if (!value) return { date: '', estimated: false };
    const exact = new Date(value);
    if (!Number.isNaN(exact.getTime()) && /\d{4}/.test(value)) {
      return { date: exact.toISOString().slice(0, 10), estimated: false };
    }
    const normalized = value.toLowerCase();
    const match = normalized.match(/(\d+)\s*(分钟|小时|天|日|周|星期|个月|月|年|min(?:ute)?s?|h(?:our)?s?|d(?:ay)?s?|w(?:eek)?s?|mo(?:nth)?s?|y(?:ear)?s?)/i);
    if (!match) return { date: '', estimated: false };
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const days = /分钟|min/.test(unit) ? amount / 1440
      : /小时|hour|^h$/.test(unit) ? amount / 24
      : /天|日|day|^d$/.test(unit) ? amount
      : /周|星期|week|^w$/.test(unit) ? amount * 7
      : /个月|^月$|month|^mo$/.test(unit) ? amount * 30.4375
      : amount * 365.25;
    const date = new Date(new Date(collectedAt).getTime() - days * 86400000);
    return { date: date.toISOString().slice(0, 10), estimated: true };
  }

  function blockedReason() {
    const body = clean(document.body?.innerText).toLowerCase();
    if (SELECTORS.loginOrLimit.some(s => document.querySelector(s))) return '检测到登录、验证码或安全检查页面';
    const phrases = ['sign in to linkedin', 'join linkedin', 'security verification', 'unusual activity',
      'temporarily restricted', '访问受限', '安全验证', '请输入验证码', '登录领英'];
    return phrases.some(p => body.includes(p)) ? '检测到登录或访问限制提示' : '';
  }

  function parseCount(raw) {
    const original = clean(raw);
    if (!original) return '';
    // Prefer the number nearest the relevant label; supports 1K, 1.2K, 3万, commas.
    const match = original.match(/(?:^|\s)(\d[\d,.]*)(\s*[KMB万亿])?(?=\s|$|\D)/i) || original.match(/(\d[\d,.]*)(\s*[KMB万亿])?/i);
    if (!match) return original;
    const num = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(num)) return original;
    const unit = clean(match[2]).toUpperCase();
    const multiplier = { K: 1e3, M: 1e6, B: 1e9, '万': 1e4, '亿': 1e8 }[unit] || 1;
    return Math.round(num * multiplier);
  }

  function countFrom(post, candidates, labelPattern) {
    const values = candidates.flatMap(s => [...post.querySelectorAll(s)]).flatMap(el => {
      const visible = textOf(el);
      const aria = clean(el.getAttribute('aria-label'));
      return [visible, aria].filter(Boolean);
    });
    // A bare action label such as “赞” is not a count. Prefer any candidate
    // containing a number, with a relevant label as a tie-breaker.
    const numeric = values.filter(v => /\d/.test(v));
    const preferred = numeric.find(v => labelPattern.test(v)) || numeric[0];
    return preferred ? parseCount(preferred) : '';
  }

  function mediaType(post) {
    for (const type of ['video', 'document', 'carousel', 'image', 'link']) {
      if (SELECTORS.media[type].some(s => post.querySelector(s))) return type;
    }
    return first(post, SELECTORS.text) ? 'text' : 'unknown';
  }

  function companyName() {
    const fromUrl = location.pathname.match(/^\/company\/([^/]+)/)?.[1];
    const heading = clean(document.querySelector('main h1, main h2, h1')?.textContent);
    return heading || (fromUrl ? decodeURIComponent(fromUrl) : '');
  }

  function extract(post, index) {
    try {
      const textParts = splitPostText(textOf(first(post, SELECTORS.text)));
      const dateLink = first(post, SELECTORS.dateLink);
      const dateEl = first(post, SELECTORS.date);
      const href = dateLink?.href || dateLink?.closest('a')?.href || '';
      const urn = post.getAttribute('data-urn') || post.getAttribute('data-id') || '';
      const activity = urn.match(/urn:li:activity:\d+/)?.[0];
      const postUrl = href || (activity ? `https://www.linkedin.com/feed/update/${activity}/` : '');
      const collectedAt = new Date().toISOString();
      const rawDate = clean(dateEl?.getAttribute('datetime')) || textOf(dateEl) || textOf(dateLink);
      const normalizedDate = estimateDate(rawDate, collectedAt);
      return {
        company: companyName(),
        collected_at: collectedAt,
        published_at_raw: rawDate,
        estimated_publish_date: normalizedDate.date,
        post_text_raw: textParts.raw,
        post_text: textParts.text,
        hashtags: textParts.hashtags,
        post_url: postUrl,
        reactions: countFrom(post, SELECTORS.reactions, /reaction|回应|赞|like/i),
        comments: countFrom(post, SELECTORS.comments, /comment|评论/i),
        reposts: countFrom(post, SELECTORS.reposts, /repost|share|转发|分享/i),
        media_type: mediaType(post)
      };
    } catch (error) {
      errors.push({ stage: 'extract', index, message: String(error) });
      return null;
    }
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = item.post_url || `${item.published_at_raw || item.post_date_raw || item.post_date || ''}|${item.post_text.slice(0, 100)}`;
      if (!key.replace('|', '')) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function dedupeKey(item) {
    return item.post_url || `${item.published_at_raw || item.post_date_raw || item.post_date || ''}|${String(item.post_text || '').slice(0, 100)}`;
  }

  async function readHistoryFile(file) {
    if (!file) return [];
    const parsed = JSON.parse(await file.text());
    const posts = Array.isArray(parsed) ? parsed : parsed?.posts;
    if (!Array.isArray(posts)) throw new Error('历史JSON中未找到 posts 数组');
    return posts;
  }

  function csvValue(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  }

  function download(name, content, type, bom = false) {
    const blob = new Blob([bom ? '\uFEFF' : '', content], { type });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createProgressPanel() {
    document.getElementById('linkedin-audit-progress-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'linkedin-audit-progress-panel';
    panel.style.cssText = 'position:fixed;right:20px;top:80px;z-index:2147483647;width:260px;padding:14px;border-radius:10px;background:#fff;color:#222;box-shadow:0 4px 20px rgba(0,0,0,.28);font:13px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;border:1px solid #ddd';
    panel.innerHTML = '<div style="font-weight:700;margin-bottom:8px">LinkedIn 内容采集</div><div data-role="setup"><div style="margin-bottom:6px">可选：加载上次导出的JSON，只采集新增帖子。</div><input data-role="history" type="file" accept=".json,application/json" style="width:100%;margin-bottom:8px"><button data-role="start" style="border:0;border-radius:16px;background:#0a66c2;color:#fff;padding:6px 12px;cursor:pointer">开始采集</button></div><div data-role="running" style="display:none"><div data-role="status">准备中…</div><div data-role="count" style="margin:5px 0">已识别 0 / 100 篇</div><button data-role="stop" style="border:0;border-radius:16px;background:#b42318;color:#fff;padding:6px 12px;cursor:pointer">停止并导出</button></div>';
    document.body.appendChild(panel);
    return {
      panel,
      waitForStart: () => new Promise(resolve => panel.querySelector('[data-role="start"]').addEventListener('click', async () => {
        const file = panel.querySelector('[data-role="history"]').files?.[0];
        try {
          const posts = await readHistoryFile(file);
          panel.querySelector('[data-role="setup"]').style.display = 'none';
          panel.querySelector('[data-role="running"]').style.display = 'block';
          resolve({ posts, fileName: file?.name || '' });
        } catch (error) {
          alert(`历史文件读取失败：${error.message}`);
        }
      })),
      status: message => { panel.querySelector('[data-role="status"]').textContent = message; },
      count: value => { panel.querySelector('[data-role="count"]').textContent = `已识别 ${Math.min(value, LINKEDIN_AUDIT_CONFIG_20260713.maxPosts)} / ${LINKEDIN_AUDIT_CONFIG_20260713.maxPosts} 篇`; },
      onStop: fn => panel.querySelector('[data-role="stop"]').addEventListener('click', fn),
      done: message => { panel.querySelector('[data-role="status"]').textContent = message; panel.querySelector('[data-role="stop"]').remove(); }
    };
  }

  const initialBlock = blockedReason();
  if (initialBlock) { console.error(`[LinkedIn采集器] 已停止：${initialBlock}。请勿尝试绕过限制。`); return; }
  if (!/linkedin\.com$/.test(location.hostname) || !/^\/company\/[^/]+\/posts\/?/.test(location.pathname)) {
    console.error('[LinkedIn采集器] 已停止：请先打开 LinkedIn 公司 Posts 页面再运行。'); return;
  }

  console.log('[LinkedIn采集器] 开始；仅读取当前页面可见/滚动加载的帖子。');
  const progress = createProgressPanel();
  const history = await progress.waitForStart();
  const historyKeys = new Set(history.posts.map(dedupeKey).filter(Boolean));
  const collected = new Map();
  let reachedHistoryBoundary = false;
  let stopRequested = false;
  progress.onStop(() => { stopRequested = true; progress.status('正在停止并整理文件…'); });
  progress.status(historyKeys.size ? `已加载 ${historyKeys.size} 篇历史记录` : '正在采集全部可见帖子');
  let previousCount = 0, idleScrolls = 0;
  while (!stopRequested && !reachedHistoryBoundary && collected.size < LINKEDIN_AUDIT_CONFIG_20260713.maxPosts && idleScrolls < LINKEDIN_AUDIT_CONFIG_20260713.maxIdleScrolls) {
    const reason = blockedReason();
    if (reason) { console.error(`[LinkedIn采集器] 已停止：${reason}。请勿尝试绕过限制。`); return; }
    for (const post of allPosts()) {
      for (const selector of SELECTORS.seeMore) {
        for (const button of post.querySelectorAll(selector)) {
          const label = textOf(button) || clean(button.getAttribute('aria-label'));
          if (/see more|查看更多|显示更多|…more/i.test(label) && !button.disabled) {
            try { button.click(); await sleep(250); } catch (e) { errors.push({ stage: 'expand', message: String(e) }); }
          }
        }
      }
    }
    const scanned = dedupe(allPosts().map(extract).filter(Boolean));
    for (const row of scanned) {
      const key = dedupeKey(row);
      if (!key) continue;
      if (historyKeys.has(key)) reachedHistoryBoundary = true;
      else if (!collected.has(key)) collected.set(key, row);
    }
    const count = collected.size;
    idleScrolls = count > previousCount ? 0 : idleScrolls + 1;
    previousCount = count;
    progress.count(count);
    progress.status(reachedHistoryBoundary ? '已遇到历史记录，准备导出新增帖子…' : idleScrolls ? `等待新内容（${idleScrolls}/${LINKEDIN_AUDIT_CONFIG_20260713.maxIdleScrolls}）` : '正在滚动加载…');
    if (reachedHistoryBoundary) break;
    console.log(`[LinkedIn采集器] 当前识别 ${Math.min(count, LINKEDIN_AUDIT_CONFIG_20260713.maxPosts)} 篇；继续滚动…`);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    await waitRandom();
  }

  const rows = [...collected.values()].slice(0, LINKEDIN_AUDIT_CONFIG_20260713.maxPosts);
  const fields = ['company','collected_at','published_at_raw','estimated_publish_date','post_text_raw','post_text','hashtags','post_url','reactions','comments','reposts','media_type'];
  const missing = Object.fromEntries(fields.map(f => [f, rows.filter(r => r[f] === '' || r[f] == null).length]));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = location.pathname.match(/^\/company\/([^/]+)/)?.[1] || 'linkedin';
  const csv = [fields.join(','), ...rows.map(r => fields.map(f => csvValue(r[f])).join(','))].join('\r\n');
  const metadata = {
    schema_version: '2.0', source_url: location.href, company: companyName(),
    requested_max: LINKEDIN_AUDIT_CONFIG_20260713.maxPosts, collected_count: rows.length,
    started_manually: true, stopped_by_user: stopRequested, generated_at: new Date().toISOString(),
    incremental_mode: historyKeys.size > 0, history_file: history.fileName,
    history_count: historyKeys.size, reached_history_boundary: reachedHistoryBoundary,
    error_count: errors.length
  };
  download(`${slug}-posts-${stamp}.csv`, csv, 'text/csv;charset=utf-8', true);
  download(`${slug}-posts-${stamp}.json`, JSON.stringify({ metadata, posts: rows }, null, 2), 'application/json;charset=utf-8');
  console.table(rows);
  console.log(`[LinkedIn采集器] 完成：${rows.length} 篇（最多 ${LINKEDIN_AUDIT_CONFIG_20260713.maxPosts} 篇）。缺失字段：`, missing);
  if (errors.length) console.warn(`[LinkedIn采集器] 错误日志（${errors.length}）：`, errors);
  else console.log('[LinkedIn采集器] 错误日志：无。');
  progress.count(rows.length);
  progress.done(`已完成并导出 ${rows.length} 篇`);
})();
