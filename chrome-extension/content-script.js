(() => {
  'use strict';
  if (globalThis.__SIGNAL_DESK_LINKEDIN_EXTENSION__) return;
  globalThis.__SIGNAL_DESK_LINKEDIN_EXTENSION__ = true;

  const SELECTORS = {
    post: ['div.feed-shared-update-v2','div[data-urn*="urn:li:activity:"]','div[data-id*="urn:li:activity:"]','article[data-urn*="urn:li:activity:"]','article[data-id*="urn:li:activity:"]','[data-view-name="feed-full-update"]','.fie-impression-container'],
    text: ['.feed-shared-update-v2__description .update-components-text','.feed-shared-update-v2__description .break-words','.feed-shared-update-v2__description-wrapper','.feed-shared-text','.update-components-text','[data-test-id="main-feed-activity-card__commentary"]','[data-view-name="feed-commentary"]','[data-test-id*="commentary"]','[data-view-name*="commentary"]','div[dir="ltr"] > span[dir="ltr"]','span[dir="ltr"]'],
    dateLink: ['a[href*="/feed/update/urn:li:activity:"]','a[href*="/posts/"]','a.app-aware-link[href*="activity"]','time a','a time'],
    date: ['time','.update-components-actor__sub-description','.feed-shared-actor__sub-description'],
    seeMore: ['button.feed-shared-inline-show-more-text__see-more-less-toggle','button[aria-label*="see more" i]','button[aria-label*="查看更多"]','.feed-shared-inline-show-more-text button'],
    reactions: ['.social-details-social-counts__reactions-count','.social-details-social-counts__social-proof-text','.social-details-social-counts button[aria-label*="reaction" i]','.social-details-social-counts button[aria-label*="回应"]','button[aria-label*="reaction count" i]','button[aria-label*="回应数量"]','a[aria-label*="次回应"]','a[aria-label*="reactions" i]'],
    comments: ['button[aria-label*="comment" i]','button[aria-label*="评论"]','li.social-details-social-counts__comments','a[href*="comments"]'],
    reposts: ['button[aria-label*="repost" i]','button[aria-label*="转发"]','li.social-details-social-counts__item--right-aligned','button[aria-label*="share" i]'],
    blocked: ['form[action*="login"]','input[name="session_key"]','.checkpoint__container','#captcha-internal','[data-test-id="challenge-page"]'],
    promoted: ['.feed-shared-actor__sub-description [aria-label*="Promoted" i]','.update-components-actor__sub-description [aria-label*="Promoted" i]','[data-test-id*="promoted"]'],
    media: {
      video: ['video','.update-components-video','[data-test-id*="video"]'], document: ['.update-components-document','iframe[src*="document"]','[data-test-id*="document"]'],
      carousel: ['.update-components-carousel','[data-test-id*="carousel"]','[aria-label*="carousel" i]'], image: ['.update-components-image img','.feed-shared-image img','img[src*="media"]'],
      link: ['.update-components-article','.feed-shared-article','a[href] img']
    }
  };
  const DEFAULT_CONFIG = { maxPosts: 100, minWaitMs: 2000, maxWaitMs: 3000, maxIdleScrolls: 7, mode: 'fast' };
  let running = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SIGNAL_DESK_START') return;
    if (running) { sendResponse({ accepted: false, error: '当前页面已有采集任务正在运行' }); return; }
    running = true;
    sendResponse({ accepted: true });
    const input = message.settings || {};
    const mode = input.mode === 'stable' ? 'stable' : 'fast';
    const config = {
      maxPosts: [30,50,100].includes(Number(input.maxPosts)) ? Number(input.maxPosts) : DEFAULT_CONFIG.maxPosts,
      minWaitMs: mode === 'stable'
        ? Math.max(1200, Math.min(5000, Number(input.minWaitMs) || 1800))
        : Math.max(350, Math.min(1600, Number(input.minWaitMs) || 550)),
      maxWaitMs: mode === 'stable'
        ? Math.max(1500, Math.min(5000, Number(input.maxWaitMs) || 2600))
        : Math.max(500, Math.min(2000, Number(input.maxWaitMs) || 850)),
      maxIdleScrolls: Math.max(5, Math.min(12, Number(input.maxIdleScrolls) || DEFAULT_CONFIG.maxIdleScrolls)),
      mode,
      scanMode: ['limited','earliest','upward'].includes(input.scanMode) ? input.scanMode : 'limited',
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '') ? input.startDate : '',
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(input.endDate || '') ? input.endDate : '',
      companyAlias: clean(input.companyAlias).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36)
    };
    collect(Array.isArray(message.historyPosts) ? message.historyPosts : [], Array.isArray(message.resumePosts) ? message.resumePosts : [], config).finally(() => { running = false; });
  });

  const clean = value => String(value ?? '').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
  const textOf = el => clean(el?.innerText || el?.textContent);
  const splitPostText = value => {
    const raw = clean(value);
    const tags = [...new Set(raw.match(/#[\p{L}\p{N}_-]+/gu) || [])];
    return { raw, text: clean(raw.replace(/#[\p{L}\p{N}_-]+/gu, ' ')), hashtags: tags.join(' ') };
  };
  const first = (root, list) => list.map(s => root.querySelector(s)).find(Boolean) || null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomWait = config => sleep(config.minWaitMs + Math.random() * (config.maxWaitMs - config.minWaitMs));
  const keyOf = row => row.post_url || `${row.published_at_raw || row.post_date_raw || row.post_date || ''}|${String(row.post_text || '').slice(0,100)}`;

  function heuristicPostCards() {
    // LinkedIn's newer company feed no longer exposes activity URNs on the
    // card. Locate each card from its repeated action row instead. Control-menu
    // labels change frequently, while comment/repost actions remain semantic.
    const anchors = [...new Set([
      ...document.querySelectorAll('button[aria-label*="动态控制菜单"],button[aria-label*="post control menu" i],button[aria-label*="control menu" i]'),
      ...document.querySelectorAll('button[aria-label^="评论"],button[aria-label*="comment" i]'),
      ...document.querySelectorAll('button[aria-label*="重新发布"],button[aria-label*="repost" i]')
    ])];
    const cards = [];
    for (const anchor of anchors) {
      let node = anchor.parentElement;
      for (let depth=0; node && node !== document.body && depth<14; depth++,node=node.parentElement) {
        const hasComment = node.querySelector('button[aria-label^="评论"],button[aria-label*="comment" i]');
        const hasRepost = node.querySelector('button[aria-label*="重新发布"],button[aria-label*="repost" i]');
        const hasSend = node.querySelector('a[aria-label*="发送"],button[aria-label*="发送"],a[aria-label*="send" i],button[aria-label*="send" i]');
        const text = clean(node.innerText);
        const hasDate = /(?:^|\s)\d+\s*(?:分钟|小时|天|日|周|星期|个月|月|年|mins?|minutes?|hours?|days?|weeks?|months?|years?)\s*[•·]/i.test(text);
        if (hasComment && hasRepost && (hasSend || hasDate) && hasDate && text.length > 40) { cards.push(node); break; }
      }
    }
    const unique = [...new Set(cards)];
    return unique.filter(node => !unique.some(other => other !== node && node.contains(other)));
  }

  function allPosts() {
    // Use the proven DevTools-script selectors first. They are intentionally
    // strict and were able to traverse long company feeds reliably.
    const provenSelectors = [
      'div.feed-shared-update-v2',
      'div[data-urn^="urn:li:activity:"]',
      'div[data-id^="urn:li:activity:"]',
      'article[data-urn^="urn:li:activity:"]',
      'article[data-id^="urn:li:activity:"]'
    ];
    const proven = [...new Set(provenSelectors.flatMap(s => [...document.querySelectorAll(s)]))];
    if (proven.length) {
      return proven.filter(node => !proven.some(other => other !== node && other.contains(node)))
        .filter(node => !SELECTORS.promoted.some(s => node.querySelector(s)));
    }

    // Only use broader candidates when the proven structure is absent.
    const heuristic = heuristicPostCards(), heuristicSet = new Set(heuristic);
    const candidates = [...SELECTORS.post.flatMap(s => [...document.querySelectorAll(s)]), ...heuristic];
    // Newer layouts sometimes expose only the permanent activity link. Walk up
    // to the nearest semantic card instead of accepting every generic article.
    for (const selector of SELECTORS.dateLink) {
      for (const link of document.querySelectorAll(selector)) {
        const card = link.closest('article, .feed-shared-update-v2, .fie-impression-container, [data-view-name="feed-full-update"], [data-urn], [data-id]');
        if (card) candidates.push(card);
      }
    }
    const unique = [...new Set(candidates)].filter(node => {
      const urn = `${node.getAttribute('data-urn') || ''} ${node.getAttribute('data-id') || ''}`;
      return heuristicSet.has(node) || /urn:li:activity:\d+/.test(urn) || SELECTORS.dateLink.some(s => node.querySelector(s));
    });
    return unique.filter(node => !unique.some(other => other !== node && other.contains(node)))
      .filter(node => !SELECTORS.promoted.some(s => node.querySelector(s)));
  }

  function selectorDiagnostics() {
    return {
      ...Object.fromEntries(SELECTORS.post.map(s=>[s,document.querySelectorAll(s).length])),
      heuristic_action_cards: heuristicPostCards().length,
      comment_action_buttons: document.querySelectorAll('button[aria-label^="评论"],button[aria-label*="comment" i]').length,
      repost_action_buttons: document.querySelectorAll('button[aria-label*="重新发布"],button[aria-label*="repost" i]').length
    };
  }

  function scrollController() {
    const documentRoot = document.scrollingElement || document.documentElement;
    const candidates = [documentRoot];
    for (const post of allPosts()) {
      let node = post.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 80) candidates.push(node);
        node = node.parentElement;
      }
    }
    for (const selector of ['main','[role="main"]','.scaffold-layout__main','.application-outlet']) {
      for (const node of document.querySelectorAll(selector)) {
        if (node.scrollHeight > node.clientHeight + 80) candidates.push(node);
      }
    }
    const target = [...new Set(candidates)].sort((a,b) =>
      (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight)
    )[0] || documentRoot;
    const isDocument = target === documentRoot || target === document.documentElement || target === document.body;
    return {
      target,
      isDocument,
      top: isDocument ? (window.scrollY || documentRoot.scrollTop || 0) : target.scrollTop,
      height: target.scrollHeight,
      viewport: isDocument ? window.innerHeight : target.clientHeight
    };
  }

  function triggerNextPage(direction = 'down') {
    const before = scrollController();
    const distance = Math.max(560, before.viewport * .95) * (direction === 'up' ? -1 : 1);
    if (before.isDocument) {
      window.scrollBy({ top: distance, left: 0, behavior: 'smooth' });
    } else {
      before.target.scrollBy({ top: distance, left: 0, behavior: 'smooth' });
    }
    // Some LinkedIn layouts replace their feed container while loading. A
    // plain assignment provides a reliable fallback when smooth scrolling is
    // ignored or the container changes between rounds.
    setTimeout(() => {
      const after = scrollController();
      if (Math.abs(after.top - before.top) > 4) return;
      const nextTop = direction === 'up'
        ? Math.max(0, after.top - Math.abs(distance))
        : Math.min(after.height - after.viewport, after.top + Math.abs(distance));
      if (after.isDocument) {
        window.scrollTo(0, nextTop);
        if (document.scrollingElement) document.scrollingElement.scrollTop = nextTop;
      } else {
        after.target.scrollTop = nextTop;
      }
      after.target.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, 450);
  }

  function postsAtViewport(posts, scroll) {
    const rootRect = scroll.isDocument ? {top:0,bottom:window.innerHeight} : scroll.target.getBoundingClientRect();
    const padding = Math.min(140, scroll.viewport * .14);
    return posts.filter(post => {
      const rect = post.getBoundingClientRect();
      return rect.bottom >= rootRect.top-padding && rect.top <= rootRect.bottom+padding;
    });
  }

  function activityIdOf(row) {
    const match=String(row?.post_url||'').match(/urn:li:activity:(\d+)/);
    return match ? match[1] : '';
  }

  function activityDate(id) {
    try { return id ? new Date(Number(BigInt(id) >> 22n)).toISOString() : ''; } catch { return ''; }
  }

  function publishDate(row) {
    return activityDate(activityIdOf(row)).slice(0,10) || String(row?.estimated_publish_date || '').slice(0,10);
  }

  function inDateRange(row, config) {
    const date=publishDate(row);
    if(!date) return true;
    return (!config.startDate||date>=config.startDate)&&(!config.endDate||date<=config.endDate);
  }

  async function saveCheckpoint(slug, posts, config) {
    try { await chrome.runtime.sendMessage({type:'SIGNAL_DESK_SAVE_CHECKPOINT',slug,checkpoint:{posts,config,updatedAt:new Date().toISOString()}}); } catch {}
  }

  function oldestPost(rows) {
    return rows.map(row=>({row,id:activityIdOf(row)})).sort((a,b)=>{
      if(a.id&&b.id) return BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0;
      return String(a.row.estimated_publish_date||'9999').localeCompare(String(b.row.estimated_publish_date||'9999'));
    })[0] || null;
  }

  function blockedReason() {
    if (SELECTORS.blocked.some(s => document.querySelector(s))) return '检测到登录、验证码或安全检查页面';
    const body = clean(document.body?.innerText).toLowerCase();
    const phrases = ['sign in to linkedin','security verification','unusual activity','temporarily restricted','访问受限','安全验证','请输入验证码','登录领英'];
    return phrases.some(p => body.includes(p)) ? '检测到登录或访问限制提示' : '';
  }

  function parseCount(raw) {
    const original = clean(raw); if (!original) return '';
    const match = original.match(/(\d[\d,.]*)\s*([KMB万亿])?/i); if (!match) return original;
    const num = Number(match[1].replace(/,/g,'')); if (!Number.isFinite(num)) return original;
    return Math.round(num * ({K:1e3,M:1e6,B:1e9,'万':1e4,'亿':1e8}[clean(match[2]).toUpperCase()] || 1));
  }

  function countFrom(post, selectors, labelPattern) {
    const values = selectors.flatMap(s => [...post.querySelectorAll(s)]).flatMap(el => [textOf(el),clean(el.getAttribute('aria-label'))].filter(Boolean));
    const numeric = values.filter(v => /\d/.test(v));
    return parseCount(numeric.find(v => labelPattern.test(v)) || numeric[0] || '');
  }

  function mediaType(post) {
    for (const type of ['video','document','carousel','image','link']) if (SELECTORS.media[type].some(s => post.querySelector(s))) return type;
    return first(post,SELECTORS.text) ? 'text' : 'unknown';
  }

  function companyName() {
    const slug = location.pathname.match(/^\/company\/([^/]+)/)?.[1] || '';
    return clean(document.querySelector('main h1, main h2, h1')?.textContent) || decodeURIComponent(slug);
  }

  function estimateDate(raw, collectedAt) {
    const match = clean(raw).toLowerCase().match(/(\d+)\s*(分钟|小时|天|日|周|星期|个月|月|年|min(?:ute)?s?|h(?:our)?s?|d(?:ay)?s?|w(?:eek)?s?|mo(?:nth)?s?|y(?:ear)?s?)/i);
    if (!match) return { date:'', estimated:false };
    const amount=Number(match[1]), unit=match[2].toLowerCase();
    const days=/分钟|min/.test(unit)?amount/1440:/小时|hour|^h$/.test(unit)?amount/24:/天|日|day|^d$/.test(unit)?amount:/周|星期|week|^w$/.test(unit)?amount*7:/个月|^月$|month|^mo$/.test(unit)?amount*30.4375:amount*365.25;
    return { date:new Date(new Date(collectedAt).getTime()-days*86400000).toISOString().slice(0,10), estimated:true };
  }

  function extract(post) {
    const dateLink=first(post,SELECTORS.dateLink), dateEl=first(post,SELECTORS.date);
    const fallbackDate=clean(post.innerText).match(/(?:^|\s)(\d+\s*(?:分钟|小时|天|日|周|星期|个月|月|年|mins?|minutes?|hours?|days?|weeks?|months?|years?))(?:\s*[•·])/i)?.[1]||'';
    let textEl=first(post,SELECTORS.text);
    if(!textEl||textOf(textEl).length<30){
      const selectorMatches=SELECTORS.text.flatMap(selector=>[...post.querySelectorAll(selector)]);
      const candidates=[...new Set([...selectorMatches,...post.querySelectorAll('p,span,div')])].filter(el=>{
        const value=textOf(el);
        return value.length>=30&&el.children.length<=3&&!/位关注者|回应按钮状态|打开.*动态控制菜单/.test(value);
      }).sort((a,b)=>textOf(b).length-textOf(a).length);
      textEl=candidates[0]||null;
    }
    const textParts=splitPostText(textOf(textEl));
    const rawDate=clean(dateEl?.getAttribute('datetime'))||textOf(dateEl)||fallbackDate||textOf(dateLink), collectedAt=new Date().toISOString(), normalized=estimateDate(rawDate,collectedAt);
    const urn=post.getAttribute('data-urn')||post.getAttribute('data-id')||'', activity=urn.match(/urn:li:activity:\d+/)?.[0];
    const href=dateLink?.href||dateLink?.closest('a')?.href||'';
    const permanentHref=/\/feed\/update\/urn:li:activity:\d+|urn:li:activity:\d+|\/posts\/[^/?#]+-activity-\d+/i.test(href)?href:'';
    const url=permanentHref||(activity?`https://www.linkedin.com/feed/update/${activity}/`: '');
    return {company:companyName(),collected_at:collectedAt,published_at_raw:rawDate,estimated_publish_date:normalized.date,post_text_raw:textParts.raw,post_text:textParts.text,hashtags:textParts.hashtags,post_url:url,
      reactions:countFrom(post,SELECTORS.reactions,/reaction|回应|赞|like/i),comments:countFrom(post,SELECTORS.comments,/comment|评论/i),reposts:countFrom(post,SELECTORS.reposts,/repost|share|转发|分享/i),media_type:mediaType(post)};
  }

  function createPanel(config) {
    document.getElementById('signal-desk-capture-panel')?.remove();
    const panel=document.createElement('aside'); panel.id='signal-desk-capture-panel';
    panel.style.cssText='position:fixed;right:20px;top:78px;z-index:2147483647;width:275px;padding:15px;border:1px solid #d8e4ec;border-radius:14px;background:#fbfdff;color:#102a43;box-shadow:0 18px 50px rgba(21,54,79,.2);font:13px/1.45 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    const target=config.scanMode==='limited'?` / ${config.maxPosts}`:'';
    panel.innerHTML=`<div style="display:flex;align-items:center;gap:8px;font-weight:750"><i style="width:8px;height:8px;border-radius:50%;background:#eaaa00;box-shadow:0 0 0 5px rgba(234,170,0,.13)"></i><span data-title>SignalScope 正在采集</span><button data-close aria-label="关闭" title="关闭" style="margin-left:auto;border:0;background:transparent;color:#52697b;font-size:20px;line-height:1;cursor:pointer">×</button></div><div data-status style="margin:9px 0 3px;color:#52697b">准备中…</div><div data-count style="font-size:20px;font-weight:700">0${target}</div><div data-metrics style="margin-top:7px;padding:7px 9px;border-radius:8px;background:#edf4f8;color:#52697b;font-size:11px;line-height:1.55">滚动 0 次 · 本轮 +0<br>页面高度 0 · 等待 0/${config.maxIdleScrolls}</div><div style="display:flex;gap:7px;flex-wrap:wrap"><button data-stop style="margin-top:11px;border:0;border-radius:999px;background:#bc4a36;color:#fff;padding:7px 12px;cursor:pointer">停止并导出</button><button data-diagnostic style="display:none;margin-top:11px;border:1px solid #b8cad7;border-radius:999px;background:#fff;color:#174b70;padding:6px 10px;cursor:pointer">下载诊断</button></div>`;
    panel.querySelector('[data-close]').addEventListener('click',()=>panel.remove());
    document.body.appendChild(panel); return panel;
  }

  function browserDownload(name, content, type, bom=false) {
    const blob=new Blob([bom?'\uFEFF':'',content],{type}), url=URL.createObjectURL(blob), a=Object.assign(document.createElement('a'),{href:url,download:name});
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function download(name, content, type, bom=false) {
    try {
      const result=await chrome.runtime.sendMessage({type:'SIGNAL_DESK_SAVE_FILE',name,content:`${bom?'\uFEFF':''}${content}`});
      if(result?.saved) return true;
    } catch {}
    browserDownload(name,content,type,bom); return false;
  }
  const csvValue=value=>`"${String(value??'').replace(/"/g,'""')}"`;

  function stopLabel(reason) {
    return ({target_reached:'已达到目标数量',date_boundary:'已越过开始日期',history_boundary:'已遇到历史帖子',oldest_boundary:'已确认到达账号历史底部',top_boundary:'已回到页面顶部',user_stopped:'用户手动停止',no_new_content:'加载停止但未充分确认底部',access_restricted:'检测到登录或访问限制',selector_not_found:'页面未识别到帖子'}[reason] || '采集结束');
  }

  async function collect(historyPosts, resumePosts, config) {
    const errors=[];
    if (!/(^|\.)linkedin\.com$/.test(location.hostname) || !/^\/company\/[^/]+\/posts\/?/.test(location.pathname)) { alert('请先打开 LinkedIn 公司 Posts 页面。'); return; }
    const initialBlock=blockedReason(); if(initialBlock){alert(`${initialBlock}。采集已停止，请勿尝试绕过限制。`);return;}
    const panel=createPanel(config), status=panel.querySelector('[data-status]'), countEl=panel.querySelector('[data-count]'), metrics=panel.querySelector('[data-metrics]'), diagnosticButton=panel.querySelector('[data-diagnostic]');
    const historyKeys=new Set(historyPosts.map(keyOf).filter(Boolean)), collected=new Map(resumePosts.map(row=>[keyOf(row),row]).filter(([key])=>key));
    const rounds=[];
    let stop=false,reached=false,dateReached=false,idle=0,previous=collected.size,scrollRounds=0,stopReason='',previousHeight=0,previousScrollTop=-1,stalledScrollRounds=0,stableHeightRounds=0,bottomRounds=0,lastCheckpointSize=collected.size;
    panel.querySelector('[data-stop]').addEventListener('click',()=>{stop=true;stopReason='user_stopped';status.textContent='正在停止并整理文件…';});
    const unlimited=config.scanMode!=='limited'||Boolean(config.startDate), direction=config.scanMode==='upward'?'up':'down', slug=location.pathname.match(/^\/company\/([^/]+)/)?.[1].replace(/-+$/,'')||'linkedin';
    status.textContent=resumePosts.length?`继续上次扫描 · 已恢复 ${resumePosts.length} 篇`:historyKeys.size?`增量模式 · 历史 ${historyKeys.size} 篇`:config.scanMode==='earliest'?'正在查找最早帖子':config.scanMode==='upward'?'从当前位置向上扫描':`${config.mode==='stable'?'稳定':'快速'}模式 · 目标 ${config.maxPosts} 篇`;
    while(!stop&&!reached&&!dateReached&&(unlimited||[...collected.values()].filter(row=>inDateRange(row,config)).length<config.maxPosts)&&idle<config.maxIdleScrolls){
      const reason=blockedReason(); if(reason){stopReason='access_restricted';status.textContent=`已停止：${reason}`;alert(`${reason}。请勿尝试绕过限制。`);break;}
      const scrollBefore=scrollController(),currentPosts=postsAtViewport(allPosts(),scrollBefore);
      for(const post of currentPosts) for(const selector of SELECTORS.seeMore) for(const button of post.querySelectorAll(selector)){
        const label=textOf(button)||clean(button.getAttribute('aria-label'));
        if(/see more|查看更多|显示更多|…more/i.test(label)&&!button.disabled)try{button.click();await sleep(200);}catch(error){errors.push(String(error));}
      }
      for(const post of currentPosts)try{const row=extract(post),key=keyOf(row),date=publishDate(row);if(!key)continue;if(historyKeys.has(key))reached=true;else if(!collected.has(key))collected.set(key,row);if(direction==='down'&&config.startDate&&date&&date<config.startDate)dateReached=true;}catch(error){errors.push(String(error));}
      const added=collected.size-previous;
      const scroll=scrollController(),height=scroll.height;
      const moved=previousScrollTop<0||Math.abs(scroll.top-previousScrollTop)>4;
      stalledScrollRounds=moved?0:stalledScrollRounds+1;previousScrollTop=scroll.top;
      const atBoundary=direction==='down'?scroll.top+scroll.viewport>=height-24:scroll.top<=2;
      // Posts already present in the DOM are collected in the first round.
      // Moving through those cards should not consume the idle allowance:
      // LinkedIn loads the next batch only after the real feed boundary is hit.
      idle=added>0?0:(atBoundary||stalledScrollRounds>=2?idle+1:0);
      previous=collected.size;countEl.textContent=unlimited?`${collected.size} 篇`:`${Math.min(collected.size,config.maxPosts)} / ${config.maxPosts}`;
      stableHeightRounds=height===previousHeight?stableHeightRounds+1:0;previousHeight=height;
      bottomRounds=direction==='down'&&scroll.top+scroll.viewport>=height-24?bottomRounds+1:0;
      rounds.push({round:scrollRounds,posts:collected.size,added,page_height:height,idle_count:idle,at:new Date().toISOString()});
      const oldest=oldestPost([...collected.values()]);
      const oldestLabel=oldest?(activityDate(oldest.id).slice(0,10)||oldest.row.estimated_publish_date||oldest.row.published_at_raw||'日期未知'):'尚未识别';
      metrics.innerHTML=`${direction==='up'?'向上':'向下'}滚动 ${scrollRounds} 次 · 本轮 +${added}<br>当前最早 ${oldestLabel} · 底部确认 ${Math.min(bottomRounds,3)}/3`;
      status.textContent=reached?'已遇到历史记录，准备导出…':idle?`已到加载边界，正在等待更多（${idle}/${config.maxIdleScrolls}）`:config.mode==='stable'?'正在稳定滚动并采集…':'正在快速滚动并采集…';
      if(reached){stopReason='history_boundary';break;}
      if(dateReached){stopReason='date_boundary';break;}
      if(direction==='up'&&scroll.top<=2){stopReason='top_boundary';break;}
      if(collected.size-lastCheckpointSize>=25){await saveCheckpoint(slug,[...collected.values()],config);lastCheckpointSize=collected.size;status.textContent=`已自动保存断点 · ${collected.size} 篇`;}
      triggerNextPage(direction);scrollRounds++;await randomWait(config);
    }
    if(!stopReason) stopReason=!unlimited&&[...collected.values()].filter(row=>inDateRange(row,config)).length>=config.maxPosts?'target_reached':reached?'history_boundary':idle>=config.maxIdleScrolls?(config.scanMode==='earliest'&&bottomRounds>=3&&stableHeightRounds>=3?'oldest_boundary':'no_new_content'):'user_stopped';
    const matchingRows=[...collected.values()].filter(row=>inDateRange(row,config));
    const rows=matchingRows.slice(0,unlimited?undefined:config.maxPosts), fields=['company','collected_at','published_at_raw','estimated_publish_date','post_text_raw','post_text','hashtags','post_url','reactions','comments','reposts','media_type'];
    const stamp=new Date().toISOString().slice(0,10),fileAlias=config.companyAlias||slug;
    const csv=[fields.join(','),...rows.map(row=>fields.map(f=>csvValue(row[f])).join(','))].join('\r\n');
    if (!rows.length) {
      stopReason=collected.size?'date_range_empty':'selector_not_found';panel.querySelector('[data-title]').textContent=collected.size?'日期范围内没有帖子':'SignalScope 未找到帖子';
      status.textContent=collected.size?'已扫描到帖子，但没有符合当前日期范围的结果。':'请确认帖子已经显示，刷新页面后重试。未生成空文件。';
      countEl.textContent='0 篇'; panel.querySelector('[data-stop]')?.remove();
      const diagnostic={version:'1.2.0',stop_reason:stopReason,stop_label:stopLabel(stopReason),url:location.href,config,history_count:historyKeys.size,rounds,selector_hits:selectorDiagnostics(),errors,generated_at:new Date().toISOString()};
      diagnosticButton.style.display='inline-block';diagnosticButton.addEventListener('click',()=>download(`${fileAlias}-${stamp}-diagnostic.json`,JSON.stringify(diagnostic,null,2),'application/json;charset=utf-8'));
      console.warn('[SignalScope] 未识别到帖子。',diagnostic);
      return;
    }
    const oldest=oldestPost(rows);
    const confidence=stopReason==='oldest_boundary'?'high':['date_boundary','top_boundary','history_boundary'].includes(stopReason)?'medium':'low';
    const metadata={schema_version:'2.5-extension',source_url:location.href,company:companyName(),company_alias:fileAlias,requested_max:unlimited?null:config.maxPosts,collected_count:rows.length,scanned_count:collected.size,capture_mode:config.mode,scan_mode:config.scanMode,scan_direction:direction,date_range:{start:config.startDate||null,end:config.endDate||null},stop_reason:stopReason,stop_label:stopLabel(stopReason),boundary_confirmed:confidence==='high',boundary_confidence:confidence,boundary_evidence:{bottom_rounds:bottomRounds,stable_height_rounds:stableHeightRounds,idle_rounds:idle},resumed_from_checkpoint:resumePosts.length>0,oldest_post:oldest?{post_url:oldest.row.post_url,activity_id:oldest.id,published_at:activityDate(oldest.id)||oldest.row.estimated_publish_date||oldest.row.published_at_raw,post_text:oldest.row.post_text}:null,scroll_rounds:scrollRounds,incremental_mode:historyKeys.size>0,history_count:historyKeys.size,reached_history_boundary:reached,stopped_by_user:stop,generated_at:new Date().toISOString(),error_count:errors.length};
    const csvSaved=await download(`${fileAlias}-${stamp}.csv`,csv,'text/csv;charset=utf-8',true);
    const jsonSaved=await download(`${fileAlias}-${stamp}.json`,JSON.stringify({metadata,posts:rows},null,2),'application/json;charset=utf-8');
    let master=null;
    if(csvSaved&&jsonSaved)try{master=await chrome.runtime.sendMessage({type:'SIGNAL_DESK_UPDATE_MASTER',alias:fileAlias,posts:rows,metadata});}catch{}
    if(['target_reached','date_boundary','history_boundary','oldest_boundary','top_boundary'].includes(stopReason))try{await chrome.runtime.sendMessage({type:'SIGNAL_DESK_CLEAR_CHECKPOINT',slug});}catch{}
    else await saveCheckpoint(slug,[...collected.values()],config);
    panel.querySelector('[data-title]').textContent='SignalScope 采集结束';
    status.textContent=`${stopLabel(stopReason)} · 本批 ${rows.length} 篇${master?.updated?` · 累计 ${master.collected_count} 篇`:(csvSaved&&jsonSaved?' · 批次已保存':'')}`;panel.querySelector('[data-stop]')?.remove();
    const diagnostic={version:'1.2.0',...metadata,config,rounds,selector_hits:selectorDiagnostics(),errors};
    if(!['target_reached','date_boundary','history_boundary','oldest_boundary','top_boundary'].includes(stopReason)){
      diagnosticButton.style.display='inline-block';diagnosticButton.addEventListener('click',()=>download(`${fileAlias}-${stamp}-diagnostic.json`,JSON.stringify(diagnostic,null,2),'application/json;charset=utf-8'));
    } else setTimeout(()=>panel.remove(),6000);
    console.log('[SignalScope] 采集完成',metadata);if(errors.length)console.warn('[SignalScope] 错误日志',errors);
  }
})();
