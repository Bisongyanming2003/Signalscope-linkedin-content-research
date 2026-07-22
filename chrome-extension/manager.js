(() => {
    'use strict';
    const FIELDS = ['company','collected_at','published_at_raw','estimated_publish_date','post_text_raw','post_text','hashtags','content_topic','post_url','reactions','comments','reposts','media_type'];
    const TOPICS = [
      ['product_solution','产品与解决方案'], ['event','展会与活动'], ['customer_case','客户案例'],
      ['industry_insight','行业洞察'], ['partnership','合作伙伴'], ['brand_news','品牌与企业动态'],
      ['employer_brand','雇主品牌'], ['holiday_culture','节日与文化'], ['other','其他']
    ];
    const TOPIC_LABELS = Object.fromEntries(TOPICS);
    const TOPIC_RULES = [
      ['event',/\b(expo|exhibition|conference|summit|webinar|booth|intersolar|snec|trade show|live from)\b|展会|峰会|论坛|研讨会|展位|现场/iu],
      ['customer_case',/\b(case study|customer story|success story|installed|installation|deployment|project site)\b|客户案例|项目案例|成功案例|落地项目|并网投运/iu],
      ['partnership',/\b(partner|partnership|collaboration|cooperation|agreement|signed|joint venture)\b|合作伙伴|战略合作|签约|携手|联合/iu],
      ['employer_brand',/\b(career|careers|hiring|join our team|employee|workplace|talent|internship)\b|招聘|加入我们|员工故事|团队文化|人才|实习/iu],
      ['holiday_culture',/\b(christmas|new year|thanksgiving|earth day|women.s day|holiday|festival)\b|春节|新年|圣诞|节日|世界地球日|妇女节|端午|中秋/iu],
      ['industry_insight',/\b(insight|industry report|market report|white ?paper|trend|forecast|policy|research)\b|行业洞察|白皮书|市场报告|趋势|政策解读|研究报告/iu],
      ['product_solution',/\b(product|solution|launch|introducing|inverter|energy storage|battery|charger|technology|platform|system)\b|产品|解决方案|发布|逆变器|储能|电池|充电桩|技术|平台|系统/iu],
      ['brand_news',/\b(award|milestone|anniversary|ranking|certification|achievement|company news)\b|获奖|里程碑|周年|排名|认证|企业动态|品牌新闻/iu]
    ];
    const state = { rows: new Map(), duplicates: 0, batches: [] };
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const number = value => { const n = Number(String(value ?? '').replace(/,/g,'')); return Number.isFinite(n) ? n : 0; };
    const interactions = row => number(row.reactions) + number(row.comments) + number(row.reposts);
    const score = row => number(row.reactions) + number(row.comments) * 2 + number(row.reposts) * 3;
    const average = (rows,metric=interactions) => rows.length ? rows.reduce((sum,row)=>sum+metric(row),0)/rows.length : 0;
    const median = values => { const sorted=[...values].sort((a,b)=>a-b), middle=Math.floor(sorted.length/2); return sorted.length ? (sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2) : 0; };
    const fmt = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value || 0);
    const validDate = value => /^\d{4}-\d{2}-\d{2}/.test(clean(value)) ? clean(value).slice(0,10) : '';
    const tagsOf = row => clean(row.hashtags).split(/\s+/).filter(Boolean);
    const keyOf = row => clean(row.post_url) || `${clean(row.published_at_raw || row.post_date_raw || row.post_date)}|${clean(row.post_text).slice(0,100)}`;
    const splitPostText = value => {
      const raw = clean(value), tags = [...new Set(raw.match(/#[\p{L}\p{N}_-]+/gu) || [])];
      return { raw, text: clean(raw.replace(/#[\p{L}\p{N}_-]+/gu,' ')), hashtags: tags.join(' ') };
    };
    const classifyTopic = row => { const text=`${clean(row.post_text_raw||row.post_text)} ${clean(row.hashtags)}`; return TOPIC_RULES.find(([,pattern])=>pattern.test(text))?.[0] || 'other'; };
    const topicKey = value => TOPIC_LABELS[clean(value)] ? clean(value) : TOPICS.find(([,label])=>label===clean(value))?.[0] || '';
    const topicLabel = value => TOPIC_LABELS[value] || TOPIC_LABELS.other;
    const topicOptions = selected => TOPICS.map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');

    function parseCsv(text) {
      const rows = []; let row = [], field = '', quoted = false;
      text = text.replace(/^\uFEFF/, '');
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
          if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
          else if (c === '"') quoted = false;
          else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += c;
      }
      if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
      const headers = (rows.shift() || []).map(clean);
      return rows.filter(r => r.some(Boolean)).map(values => Object.fromEntries(headers.map((h,i) => [h, values[i] ?? ''])));
    }

    function normalize(row, fallbackCompany = '') {
      const out = {}; FIELDS.forEach(field => out[field] = row[field] ?? '');
      out.company = out.company || fallbackCompany;
      out.published_at_raw = out.published_at_raw || row.post_date_raw || row.post_date || '';
      out.estimated_publish_date = out.estimated_publish_date || row.published_date_estimated || row.post_date_estimated || '';
      const parts = splitPostText(out.post_text_raw || out.post_text);
      out.post_text_raw = out.post_text_raw || parts.raw;
      out.hashtags = out.hashtags || parts.hashtags;
      out.post_text = out.post_text_raw ? parts.text : out.post_text;
      out.content_topic = topicKey(out.content_topic) || classifyTopic(out);
      if (!out.quality_status) {
        const notes = [];
        if (!clean(out.post_text)) notes.push('正文缺失');
        if (!clean(out.post_url)) notes.push('永久链接缺失');
        if (!clean(out.published_at_raw)) notes.push('日期缺失');
        if (!clean(out.media_type) || out.media_type === 'unknown') notes.push('媒体类型未知');
        out.quality_status = notes.length ? 'review' : 'ok'; out.quality_notes = notes.join('；');
      }
      return out;
    }

    async function readFile(file) {
      const text = await file.text();
      const fileCompany = file.name.replace(/-posts-.*$/i,'').replace(/\.(csv|json)$/i,'');
      if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(text).map(row => normalize(row, fileCompany));
      const data = JSON.parse(text.replace(/^\uFEFF/, ''));
      const posts = Array.isArray(data) ? data : data?.posts;
      if (!Array.isArray(posts)) throw new Error('JSON 中没有 posts 数组');
      const metadataCompany = data?.metadata?.company || fileCompany;
      return posts.map(row => normalize(row, metadataCompany));
    }

    async function importFiles(files) {
      const valid = [...files].filter(f => /\.(csv|json)$/i.test(f.name));
      if (!valid.length) return notify('请选择 CSV 或 JSON 文件。', true);
      let added = 0, duplicated = 0, failed = [];
      for (const file of valid) {
        try {
          const rows = await readFile(file); let fileAdded = 0;
          rows.forEach(row => {
            const key = keyOf(row);
            if (!key.replace('|','')) return;
            if (state.rows.has(key)) duplicated++;
            else { state.rows.set(key,row); added++; fileAdded++; }
          });
          state.batches.push({ name: file.name, total: rows.length, added: fileAdded, at: new Date() });
        } catch (error) { failed.push(`${file.name}：${error.message}`); }
      }
      state.duplicates += duplicated;
      render();
      notify(`已加入 ${added} 条新记录，排除 ${duplicated} 条重复。${failed.length ? ` ${failed.length} 个文件读取失败。` : ''}`, !!failed.length);
    }

    function notify(message, warning=false) {
      const box = $('notice'); box.textContent = message; box.classList.add('show');
      box.style.background = warning ? '#fff0e8' : '#e8f5ee'; box.style.color = warning ? '#87380f' : '#0c6844';
    }

    function grouped(rows, field) {
      const map = new Map(); rows.forEach(row => { const key = clean(row[field]) || 'unknown'; if (!map.has(key)) map.set(key,[]); map.get(key).push(row); }); return map;
    }

    function render() {
      const rows = [...state.rows.values()];
      $('totalSeal').textContent = String(rows.length).padStart(3,'0');
      ['downloadCsv','downloadJson','saveReport','clearData','downloadFiltered'].forEach(id => $(id).disabled = !rows.length);
      renderTrack(); renderFilters(rows); renderFilteredView();
    }

    function renderFilteredView() {
      const rows = filteredRows();
      const uniqueTags = new Set(rows.flatMap(tagsOf));
      $('statPosts').textContent = fmt(rows.length);
      $('statAvgInteractions').textContent = fmt(average(rows));
      $('statMedianInteractions').textContent = fmt(median(rows.map(interactions)));
      $('statFrequency').textContent = `${fmt(frequencyOf(rows))}/周`;
      $('statHashtags').textContent = fmt(uniqueTags.size);
      $('statNew').textContent = state.batches.length ? `最近一批新增 ${state.batches.at(-1).added} · 去重 ${state.duplicates}` : '等待导入';
      renderTopics(filteredRows({ignoreTopic:true})); renderCompanies(filteredRows({ignoreCompany:true})); renderMedia(rows); renderTrend(rows); renderHashtags(rows); renderInsights(rows); renderTable(rows);
    }

    function renderTrack() {
      $('track').innerHTML = state.batches.length ? state.batches.slice(-6).reverse().map(batch =>
        `<div class="track-item"><b>${esc(batch.name)}</b><br>${batch.total} 条 · 新增 ${batch.added}</div>`).join('')
        : '<div class="track-empty">导入文件后，这里会记录每一批证据。</div>';
    }

    function renderCompanies(rows) {
      const stats = [...grouped(rows,'company')].map(([name,items]) => ({name, count:items.length, avg:average(items)})).sort((a,b)=>b.avg-a.avg);
      const max = Math.max(...stats.map(x=>x.avg),1);
      const selected=$('companyFilter').value, totalAvg=average(rows);
      const all=`<button type="button" class="company-row company-all ${selected?'':'selected'}" data-company="" aria-pressed="${selected?'false':'true'}"><div class="name">全部公司</div><div class="posts">${rows.length} 篇</div><div class="bar"><i style="width:100%"></i></div><div class="score">${fmt(totalAvg)}</div></button>`;
      $('companyChart').innerHTML = stats.length ? all+stats.map(x => `<button type="button" class="company-row ${selected===x.name?'selected':''}" data-company="${esc(x.name)}" aria-pressed="${selected===x.name?'true':'false'}"><div class="name" title="${esc(x.name)}">${esc(x.name)}</div><div class="posts">${x.count} 篇</div><div class="bar"><i style="width:${x.avg/max*100}%"></i></div><div class="score">${fmt(x.avg)}</div></button>`).join('') : '<div class="empty">导入后显示公司分类</div>';
    }

    function renderTopics(rows) {
      const selected=$('topicFilter').value;
      const stats=[...grouped(rows,'content_topic')].map(([name,items])=>{
        const media=[...grouped(items,'media_type')].map(([type,posts])=>({type,count:posts.length})).sort((a,b)=>b.count-a.count)[0];
        return {name,count:items.length,avg:average(items),median:median(items.map(interactions)),media:media?.type||'unknown'};
      }).sort((a,b)=>b.count-a.count||b.avg-a.avg);
      const all=`<button type="button" class="topic-card all-topics ${selected?'':'selected'}" data-topic="" aria-pressed="${selected?'false':'true'}"><span>完整样本</span><b>全部主题</b><small>${rows.length} 篇 · 平均互动 ${fmt(average(rows))}</small></button>`;
      $('topicBoard').innerHTML=stats.length ? all+stats.map(item=>`<button type="button" class="topic-card ${selected===item.name?'selected':''}" data-topic="${esc(item.name)}" aria-pressed="${selected===item.name?'true':'false'}"><span>${item.count} 篇 · 中位数 ${fmt(item.median)}</span><b>${esc(topicLabel(item.name))}</b><small>平均互动 ${fmt(item.avg)} · ${esc(item.media)}</small></button>`).join('') : '<div class="empty">导入后自动识别内容主题</div>';
    }

    function renderMedia(rows) {
      const stats = [...grouped(rows,'media_type')].map(([name,items]) => ({name,count:items.length,avg:average(items)})).sort((a,b)=>b.count-a.count);
      const max = Math.max(...stats.map(x=>x.count),1);
      $('mediaChart').innerHTML = stats.length ? stats.map(x => `<div class="media-row"><label>${esc(x.name)}</label><div class="bar"><i style="width:${x.count/max*100}%"></i></div><small>${x.count} / ${fmt(x.avg)}</small></div>`).join('') : '<div class="empty">导入后显示媒体类型</div>';
    }

    function frequencyOf(rows) {
      const dates = rows.map(r=>validDate(r.estimated_publish_date)).filter(Boolean).sort();
      if (!dates.length) return 0;
      if (dates.length === 1) return 1;
      const days = Math.max(7,(new Date(dates.at(-1))-new Date(dates[0]))/86400000);
      return rows.length/(days/7);
    }

    function hashtagStats(rows) {
      const map = new Map();
      rows.forEach(row => tagsOf(row).forEach(tag => { if (!map.has(tag)) map.set(tag,[]); map.get(tag).push(row); }));
      return [...map].map(([name,items])=>({name,count:items.length,avg:average(items)}));
    }

    function renderTrend(rows) {
      const months = new Map();
      rows.forEach(row => { const date=validDate(row.estimated_publish_date); if (!date) return; const month=date.slice(0,7); if (!months.has(month)) months.set(month,[]); months.get(month).push(row); });
      const stats=[...months].sort(([a],[b])=>a.localeCompare(b)).slice(-8).map(([name,items])=>({name,count:items.length,avg:average(items)}));
      const max=Math.max(...stats.map(item=>item.count),1);
      $('trendChart').innerHTML=stats.length ? stats.map(item=>`<div class="trend-row"><label>${esc(item.name)}</label><div class="bar"><i style="width:${item.count/max*100}%"></i></div><small>${item.count} 篇 / ${fmt(item.avg)}</small></div>`).join('') : '<div class="empty">当前筛选缺少可用日期</div>';
    }

    function renderHashtags(rows) {
      const stats=hashtagStats(rows).sort((a,b)=>b.count-a.count||b.avg-a.avg).slice(0,10), max=Math.max(...stats.map(item=>item.count),1);
      $('hashtagChart').innerHTML=stats.length ? stats.map(item=>`<div class="tag-row"><label title="${esc(item.name)}">${esc(item.name)}</label><div class="bar"><i style="width:${item.count/max*100}%"></i></div><small>${item.count} 次 / ${fmt(item.avg)}</small></div>`).join('') : '<div class="empty">当前筛选没有话题标签</div>';
    }

    function renderInsights(rows) {
      if (!rows.length) { $('opsInsights').innerHTML='<div class="empty">导入后生成可执行的内容线索</div>'; return; }
      const companies=[...grouped(rows,'company')].map(([name,items])=>({name,count:items.length,avg:average(items)})).sort((a,b)=>b.avg-a.avg);
      const media=[...grouped(rows,'media_type')].map(([name,items])=>({name,count:items.length,avg:average(items)})).sort((a,b)=>b.avg-a.avg);
      const topics=[...grouped(rows,'content_topic')].map(([name,items])=>({name,count:items.length,avg:average(items)})).sort((a,b)=>b.avg-a.avg||b.count-a.count);
      const top=[...rows].sort((a,b)=>score(b)-score(a))[0], cadence=frequencyOf(rows);
      const cards=[
        ['表现领先',companies[0]?.name||'—',`平均互动量 ${fmt(companies[0]?.avg)}，样本 ${companies[0]?.count||0} 篇。`],
        ['形式机会',media[0]?.name||'—',`当前平均表现最佳；建议结合样本量 ${media[0]?.count||0} 篇判断。`],
        ['主题机会',topicLabel(topics[0]?.name),topics[0]?`样本 ${topics[0].count} 篇，平均互动量 ${fmt(topics[0].avg)}。`:'尚无可比较主题。'],
        ['节奏建议',`${fmt(cadence)} 篇 / 周`,cadence<1?'样本节奏偏低，可测试固定周更并持续观察。':`最高表现帖子来自 ${top?.company||'当前样本'}，可复盘其主题与表达结构。`]
      ];
      $('opsInsights').innerHTML=cards.map(([label,title,copy])=>`<div class="insight-card"><span>${esc(label)}</span><b>${esc(title)}</b><small>${esc(copy)}</small></div>`).join('');
    }

    function renderFilters(rows) {
      const companyValue = $('companyFilter').value, mediaValue = $('mediaFilter').value, topicValue=$('topicFilter').value;
      const companies = [...new Set(rows.map(r=>clean(r.company)).filter(Boolean))].sort();
      const media = [...new Set(rows.map(r=>clean(r.media_type)).filter(Boolean))].sort();
      $('companyFilter').innerHTML = '<option value="">所有公司</option>' + companies.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
      $('topicFilter').innerHTML = '<option value="">所有主题</option>' + TOPICS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      $('mediaFilter').innerHTML = '<option value="">所有媒体</option>' + media.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
      $('companyFilter').value = companyValue; $('topicFilter').value=topicValue; $('mediaFilter').value = mediaValue;
    }

    function filteredRows({ignoreCompany=false,ignoreTopic=false}={}) {
      const q = clean($('search').value).toLowerCase(), company = $('companyFilter').value, topic=$('topicFilter').value, media = $('mediaFilter').value, from=$('dateFrom').value, to=$('dateTo').value;
      return [...state.rows.values()].filter(r => { const date=validDate(r.estimated_publish_date); return (ignoreCompany || !company || r.company===company) && (ignoreTopic || !topic || r.content_topic===topic) && (!media || r.media_type===media) && (!from || (date&&date>=from)) && (!to || (date&&date<=to)) && (!q || `${r.company} ${r.post_text} ${r.hashtags} ${topicLabel(r.content_topic)} ${r.quality_notes}`.toLowerCase().includes(q)); });
    }

    function renderTable(inputRows=filteredRows()) {
      const rows = [...inputRows].sort((a,b) => score(b)-score(a)); $('visibleCount').textContent = `${rows.length} 条`;
      $('postRows').innerHTML = rows.length ? rows.slice(0,500).map(r => `<tr><td><b>${esc(r.company)}</b></td><td>${esc(r.estimated_publish_date||r.published_at_raw)}</td><td class="post-text">${esc(clean(r.post_text).slice(0,360))}</td><td>${esc(r.hashtags)}</td><td><select class="topic-select" data-topic-key="${esc(keyOf(r))}" aria-label="修正内容主题">${topicOptions(r.content_topic)}</select></td><td>${fmt(number(r.reactions))}</td><td>${fmt(number(r.comments))}</td><td>${fmt(number(r.reposts))}</td><td>${esc(r.media_type||'unknown')}</td><td>${r.post_url?`<a class="post-link" href="${esc(r.post_url)}" target="_blank" rel="noreferrer">打开</a>`:''}</td></tr>`).join('') : '<tr><td colspan="10"><div class="empty">没有符合筛选条件的帖子</div></td></tr>';
    }

    function csvValue(value) { return `"${String(value??'').replace(/"/g,'""')}"`; }
    function download(name, content, type, bom=false) { const blob=new Blob([bom?'\uFEFF':'',content],{type}); const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:name}); a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
    function stamp() { return new Date().toISOString().slice(0,10); }
    function csvFrom(rows) { return [FIELDS.join(','),...rows.map(r=>FIELDS.map(f=>csvValue(r[f])).join(','))].join('\r\n'); }
    function exportCsv() { const rows=[...state.rows.values()]; download(`linkedin-research-all-${stamp()}.csv`,csvFrom(rows),'text/csv;charset=utf-8',true); }
    function exportFilteredCsv() { const rows=filteredRows(); download(`linkedin-research-filtered-${stamp()}.csv`,csvFrom(rows),'text/csv;charset=utf-8',true); notify(`已下载当前筛选的 ${rows.length} 条帖子。`); }
    function exportJson() { const posts=[...state.rows.values()].map(row=>Object.fromEntries(FIELDS.map(field=>[field,row[field]??'']))); const data={metadata:{schema_version:'2.4',generated_at:new Date().toISOString(),collected_count:posts.length,batch_count:state.batches.length},posts}; download(`linkedin-all-companies-${stamp()}.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8'); }

    function reportHtml() {
      const rows=filteredRows(), companies=[...grouped(rows,'company')].map(([name,items])=>({name,count:items.length,avg:average(items)})).sort((a,b)=>b.avg-a.avg), topics=[...grouped(rows,'content_topic')].map(([name,items])=>({name,count:items.length,avg:average(items),median:median(items.map(interactions))})).sort((a,b)=>b.avg-a.avg), top=[...rows].sort((a,b)=>score(b)-score(a)).slice(0,20);
      const companyRows=companies.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.count}</td><td>${fmt(x.avg)}</td></tr>`).join('');
      const topicRows=topics.map(x=>`<tr><td>${esc(topicLabel(x.name))}</td><td>${x.count}</td><td>${fmt(x.avg)}</td><td>${fmt(x.median)}</td></tr>`).join('');
      const postRows=top.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.company)}</td><td>${esc(r.estimated_publish_date||r.published_at_raw)}</td><td>${esc(topicLabel(r.content_topic))}</td><td>${esc(clean(r.post_text).slice(0,420))}</td><td>${fmt(score(r))}</td></tr>`).join('');
      return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LinkedIn 内容研究报告</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;color:#102a43;background:#edf4f8;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}h1{font-size:36px}section{background:white;border:1px solid #d8e4ec;border-radius:16px;padding:22px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #d8e4ec;vertical-align:top}small{color:#6b7f92}</style><h1>LinkedIn 内容研究报告</h1><small>${new Date().toLocaleString('zh-CN')} · 本地生成 · 当前筛选 ${rows.length} 篇</small><section><h2>公司表现</h2><table><tr><th>公司</th><th>帖子</th><th>平均互动量</th></tr>${companyRows}</table></section><section><h2>内容主题表现</h2><table><tr><th>主题</th><th>帖子</th><th>平均互动量</th><th>中位互动量</th></tr>${topicRows}</table></section><section><h2>表现最佳帖子</h2><table><tr><th>#</th><th>公司</th><th>日期</th><th>主题</th><th>正文</th><th>自定义加权互动分</th></tr>${postRows}</table><small>主题由本地关键词规则自动初分并允许人工修正。自定义加权互动分仅用于辅助排序，不是 LinkedIn 官方或学术标准指标。</small></section></html>`;
    }

    $('fileInput').addEventListener('change', e=>importFiles(e.target.files));
    const drop=$('dropzone');
    ['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('drag');}));
    ['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('drag');}));
    drop.addEventListener('drop',e=>importFiles(e.dataTransfer.files));
    drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click();}});
    ['search','companyFilter','topicFilter','mediaFilter','dateFrom','dateTo'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderFilteredView));
    $('companyChart').addEventListener('click',event=>{const button=event.target.closest('[data-company]');if(!button)return;$('companyFilter').value=button.dataset.company;renderFilteredView();});
    $('topicBoard').addEventListener('click',event=>{const button=event.target.closest('[data-topic]');if(!button)return;$('topicFilter').value=button.dataset.topic;renderFilteredView();});
    $('postRows').addEventListener('change',event=>{const select=event.target.closest('[data-topic-key]');if(!select)return;const row=state.rows.get(select.dataset.topicKey);if(!row)return;row.content_topic=select.value;renderFilteredView();notify(`已将帖子主题修正为“${topicLabel(select.value)}”，下载 CSV 或 JSON 即可保存。`);});
    $('downloadCsv').addEventListener('click',exportCsv); $('downloadJson').addEventListener('click',exportJson);
    $('downloadFiltered').addEventListener('click',exportFilteredCsv);
    $('saveReport').addEventListener('click',()=>download(`linkedin-research-report-${stamp()}.html`,reportHtml(),'text/html;charset=utf-8'));
    $('clearData').addEventListener('click',()=>{if(confirm('清空当前页面中的所有导入数据？')){state.rows.clear();state.duplicates=0;state.batches=[];$('fileInput').value='';render();notify('当前研究集已清空。');}});
    render();
  })();

