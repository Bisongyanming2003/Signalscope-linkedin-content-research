'use strict';

let activeTab = null;
let historyPosts = [];
let activeCheckpoint = null;

const $ = id => document.getElementById(id);
const FOLDER_DB = 'signalscope-settings';

function folderDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FOLDER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFolderHandle(handle) {
  const db = await folderDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction('settings', 'readwrite').objectStore('settings').put(handle, 'captureFolder');
    request.onsuccess = resolve; request.onerror = () => reject(request.error);
  });
  db.close();
}

async function updateFolderStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SIGNAL_DESK_FOLDER_STATUS' });
    $('folderStatus').textContent = result?.ready ? `直接保存到：${result.name}` : '尚未选择，将保存到下载目录';
  } catch { $('folderStatus').textContent = '尚未选择，将保存到下载目录'; }
}
const showMessage = (text, error = false) => {
  const el = $('message'); el.textContent = text; el.className = `message show${error ? ' error' : ''}`;
};

function isCompanyPosts(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)linkedin\.com$/.test(parsed.hostname) && /^\/company\/[^/]+\/posts\/?/.test(parsed.pathname);
  } catch { return false; }
}

async function initialize() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const valid = activeTab && isCompanyPosts(activeTab.url);
  $('pageState').classList.add(valid ? 'ready' : 'invalid');
  $('pageTitle').textContent = valid ? '公司 Posts 页面已就绪' : '请先打开公司 Posts 页面';
  $('pageUrl').textContent = activeTab?.url || '未识别当前页面';
  $('fullStart').disabled = !valid;
  $('earliestStart').disabled = !valid;
  $('upwardStart').disabled = !valid;
  if (valid) { await Promise.all([updateCheckpointStatus(), updateCompanyProfile()]); }
}

function companySlug(url = '') {
  try { return new URL(url).pathname.match(/^\/company\/([^/]+)/)?.[1].replace(/-+$/, '') || ''; } catch { return ''; }
}

async function updateCheckpointStatus() {
  const slug = companySlug(activeTab?.url);
  if (!slug) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SIGNAL_DESK_GET_CHECKPOINT', slug });
    activeCheckpoint = result?.checkpoint || null;
    $('resumeStart').hidden = !activeCheckpoint;
    $('resumeStart').disabled = !activeCheckpoint;
    if (activeCheckpoint) $('resumeSummary').textContent = `${activeCheckpoint.posts?.length || 0} 篇 · ${new Date(activeCheckpoint.updatedAt).toLocaleString('zh-CN')}`;
  } catch {}
}

function cleanAlias(value = '') {
  return value.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,36);
}

async function updateCompanyProfile() {
  const slug=companySlug(activeTab?.url); if(!slug)return;
  try {
    const result=await chrome.runtime.sendMessage({type:'SIGNAL_DESK_GET_PROFILE',slug});
    $('companyAlias').value=result?.alias||slug;
  } catch { $('companyAlias').value=slug; }
}

async function saveCompanyProfile() {
  const slug=companySlug(activeTab?.url),alias=cleanAlias($('companyAlias').value)||slug;
  $('companyAlias').value=alias;
  if(slug)try{await chrome.runtime.sendMessage({type:'SIGNAL_DESK_SAVE_PROFILE',slug,alias});}catch{}
  return alias;
}

$('historyFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  historyPosts = [];
  $('incrementalStart').disabled = true;
  if (!file) return;
  try {
    const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    const posts = Array.isArray(data) ? data : data?.posts;
    if (!Array.isArray(posts)) throw new Error('没有找到 posts 数组');
    historyPosts = posts;
    $('fileMeta').textContent = file.name;
    $('historyCount').textContent = `已载入 ${posts.length} 篇历史帖子`;
    $('incrementalStart').disabled = !activeTab || !isCompanyPosts(activeTab.url);
  } catch (error) {
    $('fileMeta').textContent = '文件无法读取';
    $('historyCount').textContent = '请选择研究台导出的累计 JSON';
    showMessage(`历史文件读取失败：${error.message}`, true);
  }
});

async function launch(posts, scanMode = 'limited', resumePosts = []) {
  if (!activeTab?.id || !isCompanyPosts(activeTab.url)) return showMessage('当前标签页不是 LinkedIn 公司 Posts 页面。', true);
  if ($('startDate').value && $('endDate').value && $('startDate').value > $('endDate').value) return showMessage('开始日期不能晚于结束日期。', true);
  $('fullStart').disabled = true; $('earliestStart').disabled = true; $('upwardStart').disabled = true; $('incrementalStart').disabled = true;
  $('resumeStart').disabled = true;
  showMessage('正在启动采集；进度面板会显示在 LinkedIn 页面右上角。');
  try {
    await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['content-script.js'] });
    const mode = $('captureMode').value;
    const companyAlias = await saveCompanyProfile();
    const settings = {
      maxPosts: Number($('targetCount').value),
      minWaitMs: mode === 'stable' ? 3000 : 2000,
      maxWaitMs: mode === 'stable' ? 5000 : 3000,
      maxIdleScrolls: mode === 'stable' ? 10 : 7,
      mode,
      scanMode,
      startDate: $('startDate').value,
      endDate: $('endDate').value,
      companyAlias
    };
    const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'SIGNAL_DESK_START', historyPosts: posts, resumePosts, settings });
    if (!response?.accepted) throw new Error(response?.error || '页面未接受采集任务');
    const labels = { earliest: '查找最早帖子', upward: '向上扫描', limited: '完整采集' };
    showMessage(posts.length ? `增量采集已启动，历史记录 ${posts.length} 篇。` : `${labels[scanMode]}已启动，可关闭此窗口。`);
  } catch (error) {
    showMessage(`无法启动：${error.message}`, true);
    $('fullStart').disabled = false;
    $('earliestStart').disabled = false;
    $('upwardStart').disabled = false;
    $('incrementalStart').disabled = !historyPosts.length;
  }
}

$('fullStart').addEventListener('click', () => launch([]));
$('earliestStart').addEventListener('click', () => launch([], 'earliest'));
$('upwardStart').addEventListener('click', () => launch([], 'upward'));
$('resumeStart').addEventListener('click', () => {
  if (!activeCheckpoint) return;
  $('startDate').value = activeCheckpoint.config?.startDate || '';
  $('endDate').value = activeCheckpoint.config?.endDate || '';
  launch([], activeCheckpoint.config?.scanMode || 'earliest', activeCheckpoint.posts || []);
});
$('incrementalStart').addEventListener('click', () => launch(historyPosts));
$('openManager').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  window.close();
});
const PROJECT_URL = 'https://github.com/Bisongyanming2003/signalscope-linkedin-content-research';
const FEEDBACK_EMAIL = 'bzp2003@163.com';
$('starProject').addEventListener('click', async () => {
  await chrome.tabs.create({ url: PROJECT_URL });
  window.close();
});
$('sendFeedback').addEventListener('click', () => {
  const subject = encodeURIComponent('SignalScope 使用反馈');
  window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}`;
});
$('copyFeedbackEmail').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(FEEDBACK_EMAIL);
    const control = $('copyFeedbackEmail');
    control.classList.add('copied');
    control.querySelector('span').textContent = '已复制';
    setTimeout(() => {
      control.classList.remove('copied');
      control.querySelector('span').textContent = '复制';
    }, 1600);
  } catch {
    showMessage(`反馈邮箱：${FEEDBACK_EMAIL}`);
  }
});
function updateSummary() {
  $('fullSummary').textContent = `目标 ${$('targetCount').value} 篇 · ${$('captureMode').value === 'stable' ? '稳定' : '快速'}模式`;
}
$('targetCount').addEventListener('change', updateSummary);
$('captureMode').addEventListener('change', updateSummary);
initialize().catch(error => showMessage(`页面检查失败：${error.message}`, true));
$('chooseFolder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) return showMessage('当前 Chrome 不支持直接选择文件夹，将继续使用下载目录。', true);
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveFolderHandle(handle);
    $('folderStatus').textContent = `直接保存到：${handle.name}`;
    showMessage('保存文件夹已设置，之后的新扫描会直接写入这里。');
  } catch (error) {
    if (error.name !== 'AbortError') showMessage(`文件夹设置失败：${error.message}`, true);
  }
});
updateFolderStatus();
$('companyAlias').addEventListener('change', saveCompanyProfile);
