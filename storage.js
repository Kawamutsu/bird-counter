/* データ管理：JSONバックアップと復元。アプリ本体の記録保存キーを共用します。 */
'use strict';
(() => {
 const RECORDS_KEY='bird-counter-records-v1';
 const SETTINGS_KEY='bird-counter-settings-v1';
 const NEXT_ID_KEY='bird-counter-next-id-v1';
 const CUSTOM_KEY='bird-counter-custom-fields-v1';
 const BACKUP_TIME_KEY='bird-counter-last-json-backup-v1';
 const byId=id=>document.getElementById(id);
 const status=message=>{byId('backupStatus').textContent=message};
 const last=localStorage.getItem(BACKUP_TIME_KEY);
 if(last)status('前回のJSON保存操作：'+new Date(last).toLocaleString('ja-JP'));
 function downloadJson(){
  try{
   const records=JSON.parse(localStorage.getItem(RECORDS_KEY)||'[]');
   const settings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
   const nextId=Number(localStorage.getItem(NEXT_ID_KEY)||'1');
   if(!Array.isArray(records)||!Number.isSafeInteger(nextId)||nextId<1)throw Error('保存データを確認できません');
   const customFields=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');
   const backup={format:'bird-counter-backup',version:2,exportedAt:new Date().toISOString(),records,settings,nextId,customFields};
   const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='bird-counter-backup-'+new Date().toISOString().slice(0,10)+'.json';
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   const now=new Date().toISOString();localStorage.setItem(BACKUP_TIME_KEY,now);
   status('保存操作を実行：'+new Date(now).toLocaleString('ja-JP')+'（ファイルが保存されたか確認してください）');
  }catch(e){status('バックアップに失敗：'+e.message)}
 }
 async function restoreJson(file){
  if(!file)return;
  try{
   if(file.size>30*1024*1024)throw Error('30MBを超えるファイルは読み込めません');
   const data=JSON.parse(await file.text());
   if(data?.format!=='bird-counter-backup'||![1,2].includes(data.version)||!Array.isArray(data.records))throw Error('対応するバックアップ形式ではありません');
   const ids=new Set();
   for(const r of data.records){
    if(!r||!Number.isSafeInteger(r.id)||r.id<1||ids.has(r.id)||typeof r.species!=='string'||!r.species.trim()||!Number.isSafeInteger(r.count)||r.count<1||typeof r.timestamp!=='string')throw Error('記録の形式またはIDに問題があります');
    ids.add(r.id);
   }
   const s=data.settings;
   if(s!==null&&(!s||!Array.isArray(s.species)||!s.species.every(v=>typeof v==='string')||!s.choices||!['method','behavior','posture'].every(k=>Array.isArray(s.choices[k])&&s.choices[k].every(v=>typeof v==='string'))))throw Error('ボタン設定の形式に問題があります');
   const customFields=data.version===2?data.customFields:[];
   if(!Array.isArray(customFields)||!customFields.every(f=>f&&typeof f.id==='string'&&typeof f.name==='string'&&['single','multi','number','text'].includes(f.type)&&Array.isArray(f.options)&&f.options.every(x=>typeof x==='string')))throw Error('追加項目の設定が不正です');
   const maxId=data.records.reduce((m,r)=>Math.max(m,r.id),0);
   if(!Number.isSafeInteger(data.nextId)||data.nextId<=maxId)throw Error('次のIDが不正です');
   if(!confirm(`${data.records.length}件の記録で現在のデータを置き換えます。\n現在の記録はバックアップ済みですか？`))return;
   // 書き込み失敗時に元へ戻せるよう、事前の値を退避する。
   const keys=[RECORDS_KEY,SETTINGS_KEY,NEXT_ID_KEY,CUSTOM_KEY];
   const previous=keys.map(k=>localStorage.getItem(k));
   try{
    localStorage.setItem(RECORDS_KEY,JSON.stringify(data.records));
    if(s===null)localStorage.removeItem(SETTINGS_KEY);else localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));
    localStorage.setItem(NEXT_ID_KEY,String(data.nextId));
    localStorage.setItem(CUSTOM_KEY,JSON.stringify(customFields));
   }catch(e){keys.forEach((k,i)=>{try{if(previous[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,previous[i])}catch{}});throw e}
   alert('復元しました。画面を再読み込みします。');location.reload();
  }catch(e){status('復元できません：'+e.message)}finally{byId('restoreFile').value=''}
 }
 byId('backupJson').addEventListener('click',downloadJson);
 byId('restoreJson').addEventListener('click',()=>byId('restoreFile').click());
 byId('restoreFile').addEventListener('change',event=>restoreJson(event.target.files[0]));
})();
