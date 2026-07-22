'use strict';

const DB_NAME = 'signalscope-settings';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function folderHandle() {
  const db = await openDb();
  const handle = await new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get('captureFolder');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

async function setting(key, value, write = false) {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const store = db.transaction('settings', write ? 'readwrite' : 'readonly').objectStore('settings');
    const request = write ? (value === null ? store.delete(key) : store.put(value, key)) : store.get(key);
    request.onsuccess = () => resolve(write ? true : request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close(); return result;
}

async function writableFolder() {
  const handle = await folderHandle();
  if (!handle) return null;
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? handle : null;
}

async function saveFile(name, content) {
  const folder = await writableFolder();
  if (!folder) return { saved: false, reason: 'folder_unavailable' };
  const safeName = name.replace(/[\\/:*?"<>|]/g, '-');
  const dot = safeName.lastIndexOf('.');
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const extension = dot > 0 ? safeName.slice(dot) : '';
  let finalName = safeName;
  for (let index = 1; index < 100; index += 1) {
    const candidate = index === 1 ? safeName : `${base}-${String(index).padStart(2, '0')}${extension}`;
    try { await folder.getFileHandle(candidate); }
    catch { finalName = candidate; break; }
  }
  const file = await folder.getFileHandle(finalName, { create: true });
  const stream = await file.createWritable();
  await stream.write(content);
  await stream.close();
  return { saved: true, folder: folder.name, name: finalName };
}

async function writeExact(folder, name, content) {
  const file=await folder.getFileHandle(name,{create:true});
  const stream=await file.createWritable(); await stream.write(content); await stream.close();
}

async function readJson(folder, name) {
  try { const handle=await folder.getFileHandle(name); return JSON.parse(await (await handle.getFile()).text()); }
  catch { return null; }
}

const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
const postKey = row => clean(row.post_url) || `${clean(row.published_at_raw || row.estimated_publish_date)}|${clean(row.post_text).slice(0,100)}`;
const csvValue = value => `"${String(value ?? '').replace(/"/g,'""')}"`;

function missingMonths(dates) {
  if(!dates.length)return [];
  const present=new Set(dates.map(date=>date.slice(0,7))), result=[];
  let cursor=new Date(`${dates[0].slice(0,7)}-01T00:00:00Z`),end=new Date(`${dates.at(-1).slice(0,7)}-01T00:00:00Z`);
  while(cursor<=end){const month=cursor.toISOString().slice(0,7);if(!present.has(month))result.push(month);cursor.setUTCMonth(cursor.getUTCMonth()+1);}
  return result;
}

async function updateMaster(alias, incomingPosts, batchMetadata) {
  const folder=await writableFolder();
  if(!folder)return {updated:false,reason:'folder_unavailable'};
  const safeAlias=String(alias||'company').replace(/[^a-z0-9\u4e00-\u9fff_-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();
  const jsonName=`${safeAlias}-master.json`,csvName=`${safeAlias}-master.csv`;
  const existing=await readJson(folder,jsonName), previous=Array.isArray(existing)?existing:Array.isArray(existing?.posts)?existing.posts:[];
  const merged=new Map();
  for(const row of [...previous,...incomingPosts]){const key=postKey(row);if(key)merged.set(key,{...(merged.get(key)||{}),...row});}
  const posts=[...merged.values()].sort((a,b)=>String(b.estimated_publish_date||b.published_at_raw||'').localeCompare(String(a.estimated_publish_date||a.published_at_raw||'')));
  const dates=posts.map(row=>clean(row.estimated_publish_date)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const metadata={schema_version:'2.0-master',company_alias:safeAlias,collected_count:posts.length,previous_count:previous.length,added_count:Math.max(0,posts.length-previous.length),batch_count:Number(existing?.metadata?.batch_count||0)+1,coverage:{earliest:dates[0]||null,latest:dates.at(-1)||null,empty_months:missingMonths(dates)},last_batch:batchMetadata||null,updated_at:new Date().toISOString()};
  const fields=['company','collected_at','published_at_raw','estimated_publish_date','post_text_raw','post_text','hashtags','post_url','reactions','comments','reposts','media_type'];
  const csv=[fields.join(','),...posts.map(row=>fields.map(field=>csvValue(row[field])).join(','))].join('\r\n');
  await writeExact(folder,jsonName,JSON.stringify({metadata,posts},null,2));
  await writeExact(folder,csvName,`\uFEFF${csv}`);
  return {updated:true,jsonName,csvName,...metadata};
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SIGNAL_DESK_FOLDER_STATUS') {
    writableFolder().then(handle => sendResponse({ ready: Boolean(handle), name: handle?.name || '' })).catch(error => sendResponse({ ready: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_SAVE_FILE') {
    saveFile(String(message.name || 'signalscope-export.txt'), String(message.content ?? '')).then(sendResponse).catch(error => sendResponse({ saved: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_SAVE_CHECKPOINT') {
    setting(`checkpoint:${message.slug}`, message.checkpoint, true).then(() => sendResponse({ saved: true })).catch(error => sendResponse({ saved: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_GET_CHECKPOINT') {
    setting(`checkpoint:${message.slug}`).then(checkpoint => sendResponse({ checkpoint })).catch(error => sendResponse({ checkpoint: null, error: String(error) }));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_CLEAR_CHECKPOINT') {
    setting(`checkpoint:${message.slug}`, null, true).then(() => sendResponse({ cleared: true })).catch(error => sendResponse({ cleared: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_GET_PROFILE') {
    setting(`profile:${message.slug}`).then(profile => sendResponse({alias:profile?.alias||''})).catch(error => sendResponse({alias:'',error:String(error)}));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_SAVE_PROFILE') {
    setting(`profile:${message.slug}`,{alias:message.alias,updatedAt:new Date().toISOString()},true).then(()=>sendResponse({saved:true})).catch(error=>sendResponse({saved:false,error:String(error)}));
    return true;
  }
  if (message?.type === 'SIGNAL_DESK_UPDATE_MASTER') {
    updateMaster(message.alias,Array.isArray(message.posts)?message.posts:[],message.metadata).then(sendResponse).catch(error=>sendResponse({updated:false,error:String(error)}));
    return true;
  }
});
