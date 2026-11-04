/* 鳥類カウント：入力、一覧、集計、設定の処理。
 * 色や余白を変更する場合は css/style.css を編集してください。
 * 保存キー KEY/SETTINGS_KEY/NEXT_ID_KEY を不用意に変更すると過去の記録が見えなくなります。
 */

'use strict';
const DEFAULT_SPECIES=['スズメ','ハシブトガラス','ハシボソガラス','ヒヨドリ','シジュウカラ','ハクセキレイ','トビ','カワラヒワ','アオジ'];
const DEFAULT_CHOICES={sex:['M','F','U'],age:['A','J','U'],method:['目視','声のみ','写真','その他'],behavior:['飛翔','採餌','休息','囀り','地鳴き','警戒'],posture:['U','tucked','untucked','片脚立ち','座位']};
const KEY='bird-counter-records-v1';
const SETTINGS_KEY='bird-counter-settings-v1';
const NEXT_ID_KEY='bird-counter-next-id-v1';
let SPECIES=[...DEFAULT_SPECIES];let CHOICES=structuredClone(DEFAULT_CHOICES);
try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(saved&&Array.isArray(saved.species)&&saved.species.every(x=>typeof x==='string')&&saved.choices){SPECIES=[...saved.species];for(const k of ['method','behavior','posture'])if(Array.isArray(saved.choices[k])&&saved.choices[k].every(x=>typeof x==='string'))CHOICES[k]=[...saved.choices[k]];}}catch(e){console.warn('設定の読込に失敗',e)}
function persistSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({species:SPECIES,choices:CHOICES}));return true}catch(e){alert('設定を保存できませんでした');return false}}
const $=id=>document.getElementById(id);
let records=[];try{const stored=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(stored))records=stored;}catch(e){console.warn('保存済みデータを読み込めませんでした',e)}
// v1.1: Assign stable sequential IDs to legacy UUID records without dropping any data.
// Keep the previous identifier in legacyId for traceability; do not reuse deleted IDs.
let nextId=1;
let migrationReady=true;
try{
 const raw=Number(localStorage.getItem(NEXT_ID_KEY));
 const used=new Set();
 for(const r of records){if(Number.isSafeInteger(r.id)&&r.id>0)used.add(r.id)}
 const maxExisting=used.size?Math.max(...used):0;
 nextId=Math.max(Number.isSafeInteger(raw)&&raw>0?raw:1,maxExisting+1);
 let changed=false;
 for(const r of records){
  if(Number.isSafeInteger(r.id)&&r.id>0)continue;
  const old=r.id;
  while(used.has(nextId))nextId++;
  r.legacyId=old;
  r.id=nextId++;
  used.add(r.id);changed=true;
 }
 if(changed){
  // Preserve original data in a separate backup key before migrating.
  const backupKey='bird-counter-pre-v1.1-backup';
  if(localStorage.getItem(backupKey)===null)localStorage.setItem(backupKey,localStorage.getItem(KEY)||'[]');
  localStorage.setItem(KEY,JSON.stringify(records));
 }
 localStorage.setItem(NEXT_ID_KEY,String(nextId));
}catch(e){migrationReady=false;console.error('ID移行に失敗しました。保存を停止します。',e)}
let chosen='',answers={},editingId=null;let latestLocation=null;let gpsBusy=false;let rangeStart=null,rangeEnd=null,rangeMode='';
function show(page){for(const id of ['home','entry','records','settings'])$(id).classList.toggle('hidden',id!==page);$('navHome').classList.toggle('active',page==='home'||page==='entry');$('navRecords').classList.toggle('active',page==='records');$('navSettings').classList.toggle('active',page==='settings');render();if(page==='settings')renderSettings();window.scrollTo(0,0)}
function openEntry(name){editingId=null;$('deleteBtn').classList.add('hidden');$('saveBtn').textContent='記録する';chosen=name;answers={sex:'',age:'',method:[],behavior:[],posture:''};$('entryTitle').textContent=name==='その他'?'その他の種':name;$('customWrap').classList.toggle('hidden',name!=='その他');for(const id of ['customSpecies','flock','distance','freeMemo'])$(id).value='';$('count').value='1';$('error').textContent='';renderChoices();show('entry');}
function renderChoices(){for(const [key,values] of Object.entries(CHOICES)){const box=$(key+'Chips');box.replaceChildren();for(const value of values){const multiple=Array.isArray(answers[key]);const active=multiple?answers[key].includes(value):answers[key]===value;const b=document.createElement('button');b.className='chip'+(active?' active':'');b.textContent=value;b.type='button';b.setAttribute('aria-pressed',String(active));b.onclick=()=>{if(multiple)answers[key]=active?answers[key].filter(x=>x!==value):[...answers[key],value];else answers[key]=active?'':value;renderChoices()};box.append(b)}}}
function render(){
 const grid=$('speciesGrid');grid.replaceChildren();for(const name of SPECIES){const b=document.createElement('button');b.textContent=name;b.onclick=()=>openEntry(name);grid.append(b)}$('total').textContent=SPECIES.length+'種';$('recordCount').textContent=records.length+'件';
 const head=$('recordHead');head.replaceChildren();const tr=document.createElement('tr');const headers=['時刻','種名','羽数','ID','群れ','性別','年齢','確認','行動','姿勢','距離(m)','メモ','緯度','経度','GPS精度(m)'];headers.forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;if(i<3)th.className='freeze '+['c-time','c-species','c-count'][i];tr.append(th)});head.append(tr);
 const list=$('recordList');list.replaceChildren();for(const r of records.slice().reverse()){const row=document.createElement('tr');const vals=[formatTime(r.timestamp),r.species,r.count,r.id,r.flockSize??'',r.sex||'',r.age||'',(r.methods||[]).join('、'),(r.behavior||[]).join('、'),r.posture||'',r.distanceM??'',r.freeMemo||'',r.latitude??'',r.longitude??'',r.gpsAccuracyM??''];vals.forEach((v,i)=>{const td=document.createElement('td');td.textContent=String(v);td.title=String(v);if(i<3)td.className='freeze '+['c-time','c-species','c-count'][i];row.append(td)});row.onclick=()=>{if(rangeMode){const index=records.findIndex(x=>x.id===r.id);if(rangeMode==='start'){rangeStart=index;rangeEnd=null;rangeMode='end'}else{rangeEnd=index;rangeMode=''}renderRange();return}editRecord(r)};row.dataset.recordIndex=String(records.findIndex(x=>x.id===r.id));list.append(row)}renderRange();
}
function renderRange(){
 $('rangeStart').classList.toggle('selected',rangeMode==='start');$('rangeEnd').classList.toggle('selected',rangeMode==='end');
 $('rangeEnd').disabled=rangeStart===null;
 const complete=rangeStart!==null&&rangeEnd!==null;
 const low=complete?Math.min(rangeStart,rangeEnd):rangeStart;
 const high=complete?Math.max(rangeStart,rangeEnd):rangeStart;
 for(const row of $('recordList').rows){const i=Number(row.dataset.recordIndex);row.classList.toggle('in-range',low!==null&&i>=low&&i<=high);row.classList.toggle('range-edge',low!==null&&(i===low||i===high));}
 const hint=$('rangeHint');const summary=$('rangeSummary');summary.replaceChildren();summary.classList.toggle('hidden',!complete);
 if(rangeMode==='start')hint.textContent='開始する記録の行をタップしてください。';
 else if(rangeMode==='end')hint.textContent='終了する記録の行をタップしてください。';
 else if(!complete)hint.textContent='集計する場合は「開始行を選択」を押してください。';
 else{
 const chosenRecords=records.slice(low,high+1);const totals=new Map();let total=0;
 for(const r of chosenRecords){const n=Number(r.count)||0;total+=n;const v=totals.get(r.species)||{count:0,rows:0};v.count+=n;v.rows++;totals.set(r.species,v)}
 hint.textContent=`${chosenRecords.length}件の記録を選択中（表では新しい記録が上に表示されます）`;
 const h=document.createElement('strong');h.textContent=`集計結果：${totals.size}種・${total}羽（${chosenRecords.length}記録）`;summary.append(h);
 const table=document.createElement('table');const thead=document.createElement('thead');const tr=document.createElement('tr');for(const name of ['種名','合計個体数','記録件数']){const th=document.createElement('th');th.textContent=name;tr.append(th)}thead.append(tr);table.append(thead);const tbody=document.createElement('tbody');for(const [species,v] of [...totals].sort((a,b)=>b[1].count-a[1].count||a[0].localeCompare(b[0],'ja'))){const row=document.createElement('tr');for(const value of [species,v.count,v.rows]){const td=document.createElement('td');td.textContent=value;row.append(td)}tbody.append(row)}table.append(tbody);summary.append(table);
 }
}
$('rangeStart').onclick=()=>{rangeMode='start';renderRange()};$('rangeEnd').onclick=()=>{if(rangeStart!==null){rangeMode='end';renderRange()}};$('rangeClear').onclick=()=>{rangeStart=null;rangeEnd=null;rangeMode='';renderRange()};
function updateGps(){
 if(gpsBusy)return;
 const el=$('gpsStatus');
 if(!navigator.geolocation){el.textContent='この環境ではGPSを利用できません。位置情報なしで記録できます。';return}
 gpsBusy=true;el.textContent=latestLocation?'位置情報を更新中…（取得済みの位置は保持します）':'位置情報を取得中…';
 navigator.geolocation.getCurrentPosition(pos=>{
  latestLocation={latitude:pos.coords.latitude,longitude:pos.coords.longitude,gpsAccuracyM:pos.coords.accuracy,gpsTimestamp:new Date(pos.timestamp).toISOString()};
  gpsBusy=false;el.textContent=`GPS取得済み（精度 約${Math.round(pos.coords.accuracy)}m・${formatTime(pos.timestamp)}）`;
 },err=>{gpsBusy=false;el.textContent=`GPSを取得できません（${err.code===1?'許可されていないか、安全な接続ではありません':err.code===2?'位置を特定できません': 'タイムアウト'}）。位置情報なしで記録できます。`},{enableHighAccuracy:false,timeout:12000,maximumAge:120000});
}
$('refreshGps').onclick=updateGps;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateGps()});
function csvCell(value){const s=value==null?'':String(value);return '"'+s.replace(/"/g,'""')+'"'}
$('exportCsv').onclick=()=>{
 const headers=['ID','日時','種名','個体数','群れサイズ','性別','年齢','確認方法','行動','姿勢','距離_m','メモ','緯度','経度','GPS精度_m','GPS取得日時'];
 const values=records.map(r=>[r.id,r.timestamp,r.species,r.count,r.flockSize??'',r.sex||'',r.age||'',(r.methods||[]).join(';'),(r.behavior||[]).join(';'),r.posture||'',r.distanceM??'',r.freeMemo||'',r.latitude??'',r.longitude??'',r.gpsAccuracyM??'',r.gpsTimestamp||'']);
 const csv='\uFEFF'+[headers,...values].map(row=>row.map(csvCell).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='bird-count-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
function formatTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?'--:--':d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}
function editRecord(r){editingId=r.id;chosen='その他';answers={sex:r.sex||'',age:r.age||'',method:[...(r.methods||[])],behavior:[...(r.behavior||[])],posture:r.posture||''};$('entryTitle').textContent='記録を編集（ID '+r.id+'）';$('customWrap').classList.remove('hidden');$('customSpecies').value=r.species||'';$('count').value=r.count;$('flock').value=r.flockSize??'';$('distance').value=r.distanceM??'';$('freeMemo').value=r.freeMemo||'';$('error').textContent='';$('saveBtn').textContent='変更を保存';$('deleteBtn').classList.remove('hidden');renderChoices();show('entry')}

function renderSettings(){
 const root=$('settingsContent');root.replaceChildren();
 for(const [key,title] of [['species','種名ボタン'],['method','確認方法'],['behavior','行動'],['posture','姿勢']]){
  const values=key==='species'?SPECIES:CHOICES[key];
  const h=document.createElement('h3');h.textContent=title;root.append(h);
  const rows=document.createElement('div');root.append(rows);
  function update(next){if(key==='species')SPECIES=next;else CHOICES[key]=next;if(persistSettings())renderSettings();}
  values.forEach((value,i)=>{
   const row=document.createElement('div');row.className='setting-row';
   const name=document.createElement('span');name.textContent=value;row.append(name);
   const button=(label,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.setAttribute('aria-label',value+' '+label);b.onclick=action;row.append(b)};
   button('↑',()=>{const a=[...values];[a[i-1],a[i]]=[a[i],a[i-1]];update(a)},i===0);
   button('↓',()=>{const a=[...values];[a[i+1],a[i]]=[a[i],a[i+1]];update(a)},i===values.length-1);
   button('編集',()=>{const v=prompt('新しい名称',value);if(v===null)return;const n=v.trim();if(!n||values.some((x,j)=>j!==i&&x===n)){alert('空欄または重複した名称です');return}const a=[...values];a[i]=n;update(a)});
   button('削除',()=>{if(confirm('「'+value+'」をボタンから削除しますか？ 過去の記録は残ります。'))update(values.filter((_,j)=>i!==j))});
   rows.append(row);
  });
  const add=document.createElement('div');add.className='setting-add';const input=document.createElement('input');input.placeholder='新しい項目を追加';input.setAttribute('aria-label',title+'の新規項目');const b=document.createElement('button');b.textContent='追加';b.onclick=()=>{const n=input.value.trim();if(!n||values.includes(n)){alert('空欄または重複した名称です');return}update([...values,n])};input.onkeydown=e=>{if(e.key==='Enter')b.click()};add.append(input,b);root.append(add);
 }
 const note=document.createElement('p');note.className='settings-note';note.textContent='性別・年齢の選択肢は固定です。設定はこのブラウザに保存されます。';root.append(note);
}

$('otherBtn').onclick=()=>openEntry('その他');$('backBtn').onclick=()=>show('home');$('navHome').onclick=()=>show('home');$('navRecords').onclick=()=>show('records');$('navSettings').onclick=()=>show('settings');$('minus').onclick=()=>{$('count').value=String(Math.max(1,(Number($('count').value)||1)-1))};$('plus').onclick=()=>{$('count').value=String((Number($('count').value)||0)+1)};
$('saveBtn').onclick=()=>{if(!migrationReady){$('error').textContent='IDの移行または保存領域に問題があります。旧データを保護するため保存を停止しました。';return}const species=chosen==='その他'?$('customSpecies').value.trim():chosen;const count=Number($('count').value);if(!species||!Number.isSafeInteger(count)||count<1){$('error').textContent='種名と1以上の整数の個体数を入力してください';return}const optional=(id,integer)=>{const raw=$(id).value.trim();if(!raw)return null;const n=Number(raw);if(!Number.isFinite(n)||n<(id==='distance'?0:1)||(integer&&!Number.isSafeInteger(n)))throw Error(id==='distance'?'距離は0以上の数値にしてください':'群れサイズは1以上の整数にしてください');return n};let flockSize,distanceM;try{flockSize=optional('flock',true);distanceM=optional('distance',false)}catch(e){$('error').textContent=e.message;return}const r={id:editingId??nextId,timestamp:new Date().toISOString(),species,count,flockSize,sex:answers.sex,age:answers.age,methods:[...answers.method],behavior:[...answers.behavior],posture:answers.posture,distanceM,freeMemo:$('freeMemo').value.trim(),...(editingId?(()=>{const old=records.find(x=>x.id===editingId);return {latitude:old?.latitude??null,longitude:old?.longitude??null,gpsAccuracyM:old?.gpsAccuracyM??null,gpsTimestamp:old?.gpsTimestamp??null}})():{latitude:latestLocation?.latitude??null,longitude:latestLocation?.longitude??null,gpsAccuracyM:latestLocation?.gpsAccuracyM??null,gpsTimestamp:latestLocation?.gpsTimestamp??null})};const next=editingId?records.map(old=>old.id===editingId?{...r,id:old.id,timestamp:old.timestamp}:old):[...records,r];try{localStorage.setItem(KEY,JSON.stringify(next));if(!editingId){nextId++;localStorage.setItem(NEXT_ID_KEY,String(nextId))}records=next;show(editingId?'records':'home')}catch(e){$('error').textContent='保存できませんでした。端末の空き容量やブラウザ設定を確認してください。'}};
$('deleteBtn').onclick=()=>{if(!migrationReady||editingId===null||!confirm('この記録を削除しますか？\n削除したIDは再利用されません。'))return;const next=records.filter(r=>r.id!==editingId);try{localStorage.setItem(KEY,JSON.stringify(next));records=next;editingId=null;show('records')}catch(e){$('error').textContent='削除を保存できませんでした'}};
render();updateGps();
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('オフライン登録に失敗',err)));
}
