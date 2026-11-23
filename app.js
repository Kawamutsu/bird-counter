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
const CUSTOM_KEY='bird-counter-custom-fields-v1';
let CUSTOM_FIELDS=[];
try { const v=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]'); if(Array.isArray(v)) CUSTOM_FIELDS=v.filter(f=>f&&typeof f.id==='string'&&typeof f.name==='string'&&['single','multi','number','text'].includes(f.type)&&Array.isArray(f.options)); } catch(e){console.warn('追加項目を読み込めません',e)}
function saveCustomFields(next){try{localStorage.setItem(CUSTOM_KEY,JSON.stringify(next));CUSTOM_FIELDS=next;return true}catch(e){alert('追加項目を保存できませんでした');return false}}
function newFieldId(){return 'field_'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2))}
function fieldValue(r,f){const v=r.customFields?.[f.id];return Array.isArray(v)?v.join('、'):v??''}

let SPECIES=[...DEFAULT_SPECIES];let CHOICES=structuredClone(DEFAULT_CHOICES);
try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(saved&&Array.isArray(saved.species)&&saved.species.every(x=>typeof x==='string')&&saved.choices){SPECIES=[...saved.species];for(const k of ['sex','age','method','behavior','posture'])if(Array.isArray(saved.choices[k])&&saved.choices[k].every(x=>typeof x==='string'))CHOICES[k]=[...saved.choices[k]];}}catch(e){console.warn('設定の読込に失敗',e)}
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
function openEntry(name){editingId=null;$('deleteBtn').classList.add('hidden');$('saveBtn').textContent='記録する';chosen=name;answers={sex:'',age:'',method:[],behavior:[],posture:'',customFields:{}};$('entryTitle').textContent=name==='その他'?'その他の種':name;$('customWrap').classList.toggle('hidden',name!=='その他');for(const id of ['customSpecies','flock','distance','freeMemo'])$(id).value='';$('count').value='1';$('error').textContent='';renderChoices();renderCustomEntry();show('entry');}
function renderCustomEntry(){
 const root=$('customFieldsEntry');root.replaceChildren();
 for(const f of CUSTOM_FIELDS){if(f.hidden)continue;
  const wrap=document.createElement('div'),label=document.createElement('label');label.textContent=f.name+(f.unit?' ('+f.unit+')':'');wrap.append(label);
  const value=answers.customFields?.[f.id]??(f.type==='multi'?[]:'');
  if(f.type==='single'||f.type==='multi'){
   const chips=document.createElement('div');chips.className='chips';
   for(const option of f.options){const active=f.type==='multi'?Array.isArray(value)&&value.includes(option):value===option;
    const b=document.createElement('button');b.type='button';b.className='chip'+(active?' active':'');b.textContent=option;
    b.onclick=()=>{if(f.type==='multi'){const cur=Array.isArray(answers.customFields[f.id])?answers.customFields[f.id]:[];answers.customFields[f.id]=cur.includes(option)?cur.filter(x=>x!==option):[...cur,option]}else answers.customFields[f.id]=active?'':option;renderCustomEntry()};chips.append(b)}wrap.append(chips);
  }else{const input=document.createElement(f.type==='text'?'textarea':'input');if(f.type==='number'){input.type='number';input.step='any';input.inputMode='decimal'}else input.rows=2;input.value=value;input.placeholder='任意';input.oninput=()=>{answers.customFields[f.id]=input.value};wrap.append(input)}root.append(wrap);
 }
}
function renderChoices(){for(const [key,values] of Object.entries(CHOICES)){const box=$(key+'Chips');box.replaceChildren();for(const value of values){const multiple=Array.isArray(answers[key]);const active=multiple?answers[key].includes(value):answers[key]===value;const b=document.createElement('button');b.className='chip'+(active?' active':'');b.textContent=value;b.type='button';b.setAttribute('aria-pressed',String(active));b.onclick=()=>{if(multiple)answers[key]=active?answers[key].filter(x=>x!==value):[...answers[key],value];else answers[key]=active?'':value;renderChoices()};box.append(b)}}}
function render(){
 const grid=$('speciesGrid');grid.replaceChildren();for(const name of SPECIES){const b=document.createElement('button');b.textContent=name;b.onclick=()=>openEntry(name);grid.append(b)}$('total').textContent=SPECIES.length+'種';$('recordCount').textContent=records.length+'件';
 const head=$('recordHead');head.replaceChildren();const tr=document.createElement('tr');const headers=['時刻','種名','羽数','ID','群れ','性別','年齢','確認','行動','姿勢','距離(m)','メモ','緯度','経度','GPS精度(m)',...CUSTOM_FIELDS.map(f=>f.name)];headers.forEach((v,i)=>{const th=document.createElement('th');th.textContent=v;if(i<3)th.className='freeze '+['c-time','c-species','c-count'][i];tr.append(th)});head.append(tr);
 const list=$('recordList');list.replaceChildren();for(const r of records.slice().reverse()){const row=document.createElement('tr');const vals=[formatTime(r.timestamp),r.species,r.count,r.id,r.flockSize??'',r.sex||'',r.age||'',(r.methods||[]).join('、'),(r.behavior||[]).join('、'),r.posture||'',r.distanceM??'',r.freeMemo||'',r.latitude??'',r.longitude??'',r.gpsAccuracyM??'',...CUSTOM_FIELDS.map(f=>fieldValue(r,f))];vals.forEach((v,i)=>{const td=document.createElement('td');td.textContent=String(v);td.title=String(v);if(i<3)td.className='freeze '+['c-time','c-species','c-count'][i];row.append(td)});row.onclick=()=>{if(rangeMode){const index=records.findIndex(x=>x.id===r.id);if(rangeMode==='start'){rangeStart=index;rangeEnd=null;rangeMode='end'}else{rangeEnd=index;rangeMode=''}renderRange();return}editRecord(r)};row.dataset.recordIndex=String(records.findIndex(x=>x.id===r.id));list.append(row)}renderRange();
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
// CSVはダウンロードとiPhone共有で同じデータを使用する。
function makeCsvFile(){
 const headers=['ID','日時','種名','個体数','群れサイズ','性別','年齢','確認方法','行動','姿勢','距離_m','メモ','緯度','経度','GPS精度_m','GPS取得日時',...CUSTOM_FIELDS.map(f=>f.name+(f.unit?' ('+f.unit+')':''))];
 const values=records.map(r=>[r.id,r.timestamp,r.species,r.count,r.flockSize??'',r.sex||'',r.age||'',(r.methods||[]).join(';'),(r.behavior||[]).join(';'),r.posture||'',r.distanceM??'',r.freeMemo||'',r.latitude??'',r.longitude??'',r.gpsAccuracyM??'',r.gpsTimestamp||'',...CUSTOM_FIELDS.map(f=>fieldValue(r,f))]);
 const csv='\uFEFF'+[headers,...values].map(row=>row.map(csvCell).join(',')).join('\r\n');
 const now=new Date();const pad=n=>String(n).padStart(2,'0');
 const stamp=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
 return new File([csv],`bird-count-${stamp}.csv`,{type:'text/csv;charset=utf-8'});
}
function downloadCsv(file){
 const url=URL.createObjectURL(file),a=document.createElement('a');
 a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('exportCsv').onclick=()=>{try{downloadCsv(makeCsvFile())}catch(e){alert('CSVを保存できませんでした：'+e.message)}};
$('shareCsv').onclick=async()=>{
 let file;
 try{file=makeCsvFile()}catch(e){alert('CSVを作成できませんでした：'+e.message);return}
 // iOS等の共有シートにCSVファイルを渡す。未対応環境では保存へ切り替える。
 if(typeof navigator.share==='function' && typeof navigator.canShare==='function' && navigator.canShare({files:[file]})){
  try{await navigator.share({files:[file],title:'鳥類観察記録CSV'});return}
  catch(e){if(e.name==='AbortError')return;console.warn('共有できませんでした',e)}
 }
 downloadCsv(file);
 alert('この環境ではCSVファイルの共有を利用できなかったため、ダウンロードを開始しました。');
};

function formatTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?'--:--':d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}
function editRecord(r){editingId=r.id;chosen='その他';answers={sex:r.sex||'',age:r.age||'',method:[...(r.methods||[])],behavior:[...(r.behavior||[])],posture:r.posture||'',customFields:{...(r.customFields||{})}};$('entryTitle').textContent='記録を編集（ID '+r.id+'）';$('customWrap').classList.remove('hidden');$('customSpecies').value=r.species||'';$('count').value=r.count;$('flock').value=r.flockSize??'';$('distance').value=r.distanceM??'';$('freeMemo').value=r.freeMemo||'';$('error').textContent='';$('saveBtn').textContent='変更を保存';$('deleteBtn').classList.remove('hidden');renderChoices();renderCustomEntry();show('entry')}

function renderSettings(){
 const root=$('settingsContent');root.replaceChildren();
 for(const [key,title] of [['species','種名ボタン'],['sex','性別'],['age','年齢'],['method','確認方法'],['behavior','行動'],['posture','姿勢']]){
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
 const note=document.createElement('p');note.className='settings-note';note.textContent='設定はこのブラウザに保存されます。選択肢を変更しても過去の記録値は変更されません。';root.append(note);renderCustomSettings(root);
}

function renderCustomSettings(root){
 const h=document.createElement('h3');h.textContent='追加した記録項目';root.append(h);
 const description=document.createElement('p');description.className='settings-note';description.textContent='削除ではなく非表示にすると、過去の値を残したまま入力欄を隠せます。';root.append(description);
 function action(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b}
 for(const f of CUSTOM_FIELDS){const row=document.createElement('div');row.className='setting-row';const name=document.createElement('span');name.textContent=f.name+'（'+({single:'単一選択',multi:'複数選択',number:'数値',text:'自由記述'}[f.type])+ '）'+(f.hidden?'［非表示］':'');row.append(name);
  row.append(action('名称変更',()=>{const v=prompt('新しい項目名',f.name);if(v===null)return;const n=v.trim();if(!n)return;if(saveCustomFields(CUSTOM_FIELDS.map(x=>x.id===f.id?{...x,name:n}:x)))renderSettings()}));
  row.append(action(f.hidden?'表示':'非表示',()=>{if(saveCustomFields(CUSTOM_FIELDS.map(x=>x.id===f.id?{...x,hidden:!x.hidden}:x)))renderSettings()}));root.append(row);
  if(f.type==='single'||f.type==='multi'){
   const list=document.createElement('div');list.style.paddingLeft='12px';root.append(list);
   f.options.forEach((opt,i)=>{const r=document.createElement('div');r.className='setting-row';const name=document.createElement('span');name.textContent=opt;r.append(name);
    r.append(action('↑',()=>{if(i===0)return;const a=[...f.options];[a[i-1],a[i]]=[a[i],a[i-1]];updateOptions(a)}));
    r.append(action('↓',()=>{if(i===f.options.length-1)return;const a=[...f.options];[a[i+1],a[i]]=[a[i],a[i+1]];updateOptions(a)}));
    r.append(action('編集',()=>{const v=prompt('新しい選択肢名',opt);if(v===null)return;const n=v.trim();if(!n||f.options.some((x,j)=>j!==i&&x===n))return alert('空欄または重複です');const a=[...f.options];a[i]=n;updateOptions(a)}));
    r.append(action('削除',()=>{if(confirm('選択肢を非表示にしますか？ 過去の記録値は残ります。'))updateOptions(f.options.filter((_,j)=>j!==i))}));list.append(r)});
   const add=document.createElement('div');add.className='setting-add';const inp=document.createElement('input');inp.placeholder='選択肢を追加';add.append(inp,action('追加',()=>{const v=inp.value.trim();if(!v||f.options.includes(v))return alert('空欄または重複です');updateOptions([...f.options,v])}));list.append(add);
   function updateOptions(options){if(saveCustomFields(CUSTOM_FIELDS.map(x=>x.id===f.id?{...x,options}:x)))renderSettings()}
  }
 }
 const form=document.createElement('div');form.className='custom-field-create';const heading=document.createElement('h3');heading.textContent='新しい記録項目を作成';form.append(heading);
 const name=document.createElement('input');name.placeholder='項目名（例：換羽状態）';name.setAttribute('aria-label','新しい項目名');form.append(name);
 const type=document.createElement('select');for(const [value,title] of [['single','単一選択'],['multi','複数選択'],['number','数値'],['text','自由記述']]){const o=document.createElement('option');o.value=value;o.textContent=title;type.append(o)}form.append(type);
 const unit=document.createElement('input');unit.placeholder='単位（任意、例：m）';unit.setAttribute('aria-label','単位');form.append(unit);
 form.append(action('項目を追加',()=>{const n=name.value.trim();if(!n)return alert('項目名を入力してください');if(CUSTOM_FIELDS.some(f=>f.name===n))return alert('同じ項目名が存在します');const f={id:newFieldId(),name:n,type:type.value,unit:unit.value.trim(),options:[],hidden:false};if(saveCustomFields([...CUSTOM_FIELDS,f]))renderSettings()}));root.append(form);
}
$('otherBtn').onclick=()=>openEntry('その他');$('backBtn').onclick=()=>show('home');$('navHome').onclick=()=>show('home');$('navRecords').onclick=()=>show('records');$('navSettings').onclick=()=>show('settings');$('minus').onclick=()=>{$('count').value=String(Math.max(1,(Number($('count').value)||1)-1))};$('plus').onclick=()=>{$('count').value=String((Number($('count').value)||0)+1)};
$('saveBtn').onclick=()=>{if(!migrationReady){$('error').textContent='IDの移行または保存領域に問題があります。旧データを保護するため保存を停止しました。';return}const species=chosen==='その他'?$('customSpecies').value.trim():chosen;const count=Number($('count').value);if(!species||!Number.isSafeInteger(count)||count<1){$('error').textContent='種名と1以上の整数の個体数を入力してください';return}const optional=(id,integer)=>{const raw=$(id).value.trim();if(!raw)return null;const n=Number(raw);if(!Number.isFinite(n)||n<(id==='distance'?0:1)||(integer&&!Number.isSafeInteger(n)))throw Error(id==='distance'?'距離は0以上の数値にしてください':'群れサイズは1以上の整数にしてください');return n};let flockSize,distanceM;try{flockSize=optional('flock',true);distanceM=optional('distance',false)}catch(e){$('error').textContent=e.message;return}for(const f of CUSTOM_FIELDS){if(f.type==='number'){const v=answers.customFields[f.id];if(v!==undefined&&v!==''&&!Number.isFinite(Number(v))){$('error').textContent=f.name+'は数値で入力してください';return}}}const r={id:editingId??nextId,timestamp:new Date().toISOString(),species,count,flockSize,sex:answers.sex,age:answers.age,methods:[...answers.method],behavior:[...answers.behavior],posture:answers.posture,customFields:{...(editingId?records.find(x=>x.id===editingId)?.customFields||{}:{}),...answers.customFields},distanceM,freeMemo:$('freeMemo').value.trim(),...(editingId?(()=>{const old=records.find(x=>x.id===editingId);return {latitude:old?.latitude??null,longitude:old?.longitude??null,gpsAccuracyM:old?.gpsAccuracyM??null,gpsTimestamp:old?.gpsTimestamp??null}})():{latitude:latestLocation?.latitude??null,longitude:latestLocation?.longitude??null,gpsAccuracyM:latestLocation?.gpsAccuracyM??null,gpsTimestamp:latestLocation?.gpsTimestamp??null})};const next=editingId?records.map(old=>old.id===editingId?{...r,id:old.id,timestamp:old.timestamp}:old):[...records,r];try{localStorage.setItem(KEY,JSON.stringify(next));if(!editingId){nextId++;localStorage.setItem(NEXT_ID_KEY,String(nextId))}records=next;show(editingId?'records':'home')}catch(e){$('error').textContent='保存できませんでした。端末の空き容量やブラウザ設定を確認してください。'}};
$('deleteBtn').onclick=()=>{if(!migrationReady||editingId===null||!confirm('この記録を削除しますか？\n削除したIDは再利用されません。'))return;const next=records.filter(r=>r.id!==editingId);try{localStorage.setItem(KEY,JSON.stringify(next));records=next;editingId=null;show('records')}catch(e){$('error').textContent='削除を保存できませんでした'}};
render();updateGps();
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('オフライン登録に失敗',err)));
}
