import { validateCatalog, calculate, restoreState, numeric, inputValue, subdivision } from './rank-engine.mjs';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'musclerank-records-v3';
const LANGUAGE_KEY = 'musclerank-language';
const legacyKey = 'musclerank-reference-ui-v2';
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Session remains usable. */ } };
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let catalog, locales, state, exercises, tiers, muscleGroups;
let selected = 0, language = read(LANGUAGE_KEY) === 'en' ? 'en' : 'ko';
let rulers = {}, carouselBusy = false, overlayOpener = null;
const t = (key, params = {}) => (locales[language][key] || locales.en[key] || key).replace(/\{(\w+)\}/g, (_, token) => params[token] ?? `{${token}}`);
const label = object => object[language] || object.en;
const currentRecord = () => state.records[exercises[selected].id];
const results = () => calculate(catalog, state.profile, state.records);
const format = value => new Intl.NumberFormat(language === 'ko' ? 'ko-KR' : 'en-US', {maximumFractionDigits:1}).format(value);
const rankText = (score, index) => index === null ? t('rankPending') : `${label(tiers[index].label)} ${subdivision(score,index,tiers)}`.trim();
const save = () => write(STORAGE_KEY, state);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function motion(element, frames, duration = 320) {
  return element.animate(frames, {duration:reducedMotion() ? 0 : duration,easing:'cubic-bezier(.22,1,.36,1)'});
}
function badgeAt(element, index) {
  element.style.setProperty('--badge-x', `${index % 3 * 50}%`);
  element.style.setProperty('--badge-y', `${Math.floor(index / 3) * 50}%`);
}
function artAt(element, exercise) {
  const art = exercise.artwork;
  element.classList.toggle('art-fallback', !art);
  element.style.backgroundImage = art ? `url("${art.src}")` : 'none';
  element.style.backgroundSize = art ? `${art.columns * 100}% 100%` : '';
  element.style.backgroundPosition = art ? `${art.columns > 1 ? art.index/(art.columns-1)*100 : 50}% center` : '';
  element.textContent = art ? '' : '🏋';
}
function renderLocale() {
  document.documentElement.lang = language; document.title = t('pageTitle');
  $('language').value = language; $('language').setAttribute('aria-label', t('language'));
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  document.querySelectorAll('#bodygraph svg').forEach((svg,index) => svg.setAttribute('aria-label',t(index ? 'back' : 'front')));
  renderEditor();
  if (!$('picker-overlay').hidden) renderPicker();
}
function buildBody() {
  const ns = 'http://www.w3.org/2000/svg';
  for (const side of ['front','back']) {
    const svg = document.createElementNS(ns,'svg'); svg.setAttribute('viewBox',window.BODY_MODEL[side].viewBox);
    const outline = document.createElementNS(ns,'path'); outline.setAttribute('d',window.BODY_MODEL[side].outline); outline.setAttribute('fill','#dedce8'); svg.append(outline);
    for (const part of window.BODY_MODEL[side].parts) {
      const group = document.createElementNS(ns,'g'); group.dataset.muscle = part.slug;
      const muscle = muscleGroups.find(item => item.parts.includes(part.slug));
      if (muscle) {
        group.dataset.group = muscle.id; group.setAttribute('role','button'); group.setAttribute('tabindex','0');
        const select = () => { const card=$('muscle-'+muscle.id);card.open=true;card.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'center'}); };
        group.addEventListener('click',select);group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select();}});
      }
      for(const d of part.paths){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);group.append(path);}
      svg.append(group);
    }
    $('bodygraph').append(svg);
  }
  $('muscle-rankings').innerHTML = muscleGroups.map((muscle,index)=>`<details class="muscle-card" id="muscle-${muscle.id}" ${index===0?'open':''}><summary><span class="muscle-emblem" aria-hidden="true"><svg viewBox="0 0 60 68"><path d="M30 2 57 17v34L30 66 3 51V17Z"/><path class="emblem-muscle" d="M19 25q11-7 22 0l-3 12-8 8-8-8zM30 23v22M20 31h20"/></svg></span><span class="muscle-card-name"><span class="muscle-name"></span><b class="muscle-tier"></b></span><span class="expand-chevron">⌃</span></summary><div class="muscle-detail"></div></details>`).join('');
  $('muscle-rankings').addEventListener('click',event=>{
    const button=event.target.closest('[data-edit]');if(!button)return;
    stopRulers();selected=exercises.findIndex(exercise=>exercise.id===button.dataset.edit);renderEditor();showScreen('editor');
  });
  document.querySelectorAll('.muscle-card').forEach(card=>{
    let busy=false;
    card.querySelector('summary').addEventListener('click',async event=>{
      event.preventDefault();if(busy)return;busy=true;
      const wasOpen=card.open,from=card.offsetHeight;card.open=true;
      const to=wasOpen?card.querySelector('summary').offsetHeight:card.offsetHeight;card.style.overflow='hidden';
      await motion(card,[{height:`${from}px`},{height:`${to}px`}],300).finished;
      card.open=!wasOpen;card.style.overflow='';busy=false;
    });
  });
}
function renderBody(result) {
  $('body-profile-summary').textContent=`${state.profile.height} cm · ${state.profile.bodyweight} kg`;
  for(const group of muscleGroups){
    const muscle=result.muscles.find(item=>item.id===group.id),tier=muscle.tier===null?null:tiers[muscle.tier],card=$('muscle-'+group.id);
    for(const [key,value] of Object.entries({color:tier?.color||'#b9b8ce',deep:tier?.deep||'#302b3b',mid:tier?.mid||'#40384c'}))card.style.setProperty('--muscle-'+key,value);
    card.querySelector('.muscle-name').textContent=label(group.label);card.querySelector('.muscle-tier').textContent=rankText(muscle.score,muscle.tier);
    const linked=result.lifts.filter(lift=>lift.muscles[group.id]);
    const totalWeight=muscle.contributors.reduce((sum,lift)=>sum+lift.muscles[group.id],0);
    card.querySelector('.muscle-detail').innerHTML=linked.map(lift=>`<button data-edit="${lift.id}" type="button"><span class="exercise-art" data-art="${lift.id}" aria-hidden="true"></span><span>${escape(label(lift.name))}<small>${lift.valid?t('contribution',{percent:Math.round(lift.muscles[group.id]/totalWeight*100)}):t('noRecord')}</small><b class="muscle-record">${lift.valid?`${format(lift.weight)} kg × ${lift.reps} ${t('repsUnit')}`:t('noMuscleRecord')}</b></span><span class="badge-sprite" data-badge="${lift.valid?lift.tier:0}" ${lift.valid?'':'hidden'} aria-hidden="true"></span></button>`).join('');
    card.querySelectorAll('[data-art]').forEach(el=>artAt(el,exercises.find(ex=>ex.id===el.dataset.art)));
    card.querySelectorAll('[data-badge]').forEach(el=>badgeAt(el,Number(el.dataset.badge)));
    document.querySelectorAll(`[data-group="${group.id}"]`).forEach(part=>{part.style.setProperty('--muscle-fill',tier?.color||'#b9b8ce');part.setAttribute('aria-label',`${label(group.label)}: ${rankText(muscle.score,muscle.tier)}`);});
  }
  const used=[...new Set(result.muscles.filter(m=>m.tier!==null).map(m=>m.tier))].sort((a,b)=>a-b);
  $('body-legend').innerHTML=used.map(index=>`<span><i style="background:${tiers[index].color}"></i>${escape(label(tiers[index].label))}</span>`).join('')+`<span><i style="background:#b9b8ce"></i>${t('rankPending')}</span>`;
}
function renderEditor() {
  const exercise=exercises[selected],previous=exercises[(selected+exercises.length-1)%exercises.length],next=exercises[(selected+1)%exercises.length];
  $('exercise-title').textContent=exercise.title[language].join('\n');
  $('previous-title').textContent=label(previous.name);$('next-title').textContent=label(next.name);
  artAt($('center-art'),exercise);artAt($('previous-art'),previous);artAt($('next-art'),next);
  $('center-art').setAttribute('aria-label',t('exerciseArt',{name:label(exercise.name)}));
  $('bodyweight-display').textContent=`${state.profile.bodyweight||'—'} kg`;
  for(const field of ['weight','reps']){
    const input=$(field+'-input'),range=exercise.input[field];
    for(const key of ['min','max','step'])input[key]=range[key];
    input.value=currentRecord()[field];rulers[field].configure({...range,unit:field==='weight'?'kg':t('repsUnit')});rulers[field].set(input.value);
  }
  $('previous').disabled=$('next').disabled=exercises.length<2;
  renderComputed();
}
function renderComputed() {
  const result=results(),exercise=exercises[selected],range=exercise.input;
  let valid=true,empty=false;
  for(const field of ['weight','reps']){
    const input=$(field+'-input'),fieldValid=inputValue(currentRecord()[field],range[field],field==='reps')!==null;
    valid=valid&&fieldValid;empty=empty||!input.value;
    input.classList.toggle('invalid',!fieldValid&&!!input.value);input.setAttribute('aria-invalid',String(!fieldValid));
    input.parentElement.style.setProperty('--number-offset',`${Math.max(20,input.value.length*14+5)}px`);
  }
  $('record-error').hidden=valid||empty;
  $('record-error').textContent=t('invalidRecord',{min:range.weight.min,max:range.weight.max,step:range.weight.step,repMin:range.reps.min,repMax:range.reps.max});
  $('records-count').textContent=t('recordCount',{count:result.count,total:exercises.length});
  $('get-rank').disabled=!valid||!result.lifts[selected].valid;
  renderResult(result);renderBody(result);
}
function renderResult(result) {
  const hasRank=result.tier!==null,tier=tiers[hasRank?result.tier:3];
  for(const key of ['light','mid','deep'])$('result-card').style.setProperty('--rank-'+key,tier[key]);
  $('result-screen').style.setProperty('--result-accent',tier.color);
  $('rank-name').textContent=rankText(result.score,result.tier);badgeAt($('result-badge'),hasRank?result.tier:3);
  $('result-badge').setAttribute('aria-label',hasRank?t('badge',{tier:label(tier.label)}):t('rankPending'));
  $('result-title').textContent=t(hasRank?'rankTitle':'rankEmpty');
  $('total-weight').textContent=result.total===null?'—':`${format(result.total)} kg`;
  $('rank-score').textContent=hasRank?`${result.score.toFixed(2)}×`:'—';
  $('result-lifts').innerHTML=result.lifts.map(lift=>`<span><small>${escape(label(lift.name))}</small><b>${lift.valid?`${format(lift.oneRepMax)} kg`:'—'}</b></span>`).join('');
  $('rank-ladder').innerHTML=tiers.map((item,index)=>`<div class="rank-item ${index===result.tier?'active':''}" style="--tier-color:${item.color}"><span class="badge-sprite" style="--badge-x:${index%3*50}%;--badge-y:${Math.floor(index/3)*50}%" aria-hidden="true"></span><span>${escape(label(item.label))}</span></div>`).join('');
  const next=hasRank?tiers[result.tier+1]:null;
  $('next-rank').textContent=!hasRank?t('rankEmpty'):!next?t('highest'):t('nextRank',{tier:label(next.label),progress:Math.round(Math.max(0,Math.min(1,(result.score-tier.minScore)/(next.minScore-tier.minScore)))*100)});
}
function stopRulers(){Object.values(rulers).forEach(ruler=>ruler.stop(true));}
function showScreen(screen){
  stopRulers();for(const name of ['body','editor','result'])$(name+'-screen').hidden=name!==screen;renderComputed();window.scrollTo({top:0,behavior:'instant'});
  const element=$(screen+'-screen');motion(element,[{opacity:0,transform:`translateY(${screen==='editor'?35:12}px)`},{opacity:1,transform:'translateY(0)'}],380);
  element.setAttribute('tabindex','-1');element.focus({preventScroll:true});
}
function showOverlay(id){stopRulers();overlayOpener=document.activeElement;const overlay=$(id);overlay.hidden=false;document.body.style.overflow='hidden';motion(overlay,[{opacity:0},{opacity:1}],220);motion(overlay.querySelector('.sheet'),[{transform:'translateY(60px)'},{transform:'translateY(0)'}],360);overlay.querySelector('button').focus();}
async function hideOverlay(id){const overlay=$(id);if(overlay.hidden||overlay.dataset.closing)return;overlay.dataset.closing='true';await motion(overlay,[{opacity:1},{opacity:0}],140).finished.catch(()=>{});overlay.hidden=true;delete overlay.dataset.closing;document.body.style.overflow='';overlayOpener?.focus({preventScroll:true});}
async function selectExercise(index,direction=1){
  if(carouselBusy||index===selected)return;carouselBusy=true;stopRulers();
  const panels=[...document.querySelectorAll('.exercise-carousel > *')];
  try{
    await Promise.all(panels.map(el=>motion(el,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*45}px)`}],140).finished));
    selected=index;renderEditor();
    await Promise.all(panels.map(el=>motion(el,[{opacity:0,transform:`translateX(${direction*45}px)`},{opacity:1,transform:'translateX(0)'}],260).finished));
  }finally{carouselBusy=false;}
}
function renderPicker(){
  const result=results();
  $('picker-list').innerHTML=result.lifts.map(lift=>`<button type="button" data-pick="${lift.id}"><span class="exercise-art" data-art="${lift.id}" aria-hidden="true"></span><span>${escape(label(lift.name))}<small>${escape(label(lift.equipment))}</small></span><span class="badge-sprite" data-badge="${lift.valid?lift.tier:0}" ${lift.valid?'':'hidden'} aria-hidden="true"></span></button>`).join('');
  $('picker-list').querySelectorAll('[data-art]').forEach(el=>artAt(el,exercises.find(ex=>ex.id===el.dataset.art)));
  $('picker-list').querySelectorAll('[data-badge]').forEach(el=>badgeAt(el,Number(el.dataset.badge)));
}
function openProfile(){for(const key of ['gender','height','bodyweight'])$(key).value=state.profile[key];$('profile-error').hidden=true;showOverlay('profile-overlay');}
function bindEvents(){
  rulers=Object.fromEntries(['weight','reps'].map(field=>[field,new window.RulerControl($(field+'-range'),{...exercises[0].input[field],unit:field==='weight'?'kg':t('repsUnit'),onChange(value){$(field+'-input').value=value;currentRecord()[field]=String(value);renderComputed();},onCommit:save})]));
  for(const field of ['weight','reps'])$(field+'-input').addEventListener('input',()=>{currentRecord()[field]=$(field+'-input').value;rulers[field].set(currentRecord()[field]);save();renderComputed();});
  $('language').addEventListener('change',()=>{stopRulers();language=$('language').value;write(LANGUAGE_KEY,language);renderLocale();});
  $('previous').addEventListener('click',()=>selectExercise((selected+exercises.length-1)%exercises.length,-1));
  $('next').addEventListener('click',()=>selectExercise((selected+1)%exercises.length,1));
  let start=null;const carousel=document.querySelector('.exercise-carousel');
  carousel.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
  carousel.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))selectExercise((selected+(dx<0?1:exercises.length-1))%exercises.length,dx<0?1:-1);});
  carousel.addEventListener('pointercancel',()=>{start=null;});
  $('open-picker').addEventListener('click',()=>{renderPicker();showOverlay('picker-overlay');});
  $('picker-list').addEventListener('click',event=>{const button=event.target.closest('[data-pick]');if(button){selectExercise(exercises.findIndex(ex=>ex.id===button.dataset.pick));hideOverlay('picker-overlay');}});
  for(const name of ['profile','picker','method']){
    $('close-'+name).addEventListener('click',()=>hideOverlay(name+'-overlay'));
    $(name+'-overlay').addEventListener('click',event=>{if(event.target===$(name+'-overlay'))hideOverlay(name+'-overlay');});
  }
  for(const id of ['open-profile','body-profile'])$(id).addEventListener('click',openProfile);
  $('save-profile').addEventListener('click',()=>{
    const height=numeric($('height').value,100,230),bodyweight=numeric($('bodyweight').value,20,400);
    $('height').classList.toggle('invalid',height===null);$('bodyweight').classList.toggle('invalid',bodyweight===null);
    $('profile-error').hidden=height!==null&&bodyweight!==null;if(!$('profile-error').hidden)return;
    state.profile={gender:$('gender').value,height:$('height').value,bodyweight:$('bodyweight').value};save();renderEditor();hideOverlay('profile-overlay');
  });
  for(const [id,screen] of [['get-rank','body'],['show-result','body'],['edit-lifts','editor'],['back-to-editor','editor'],['body-rank','result'],['body-record','editor'],['body-add-record','editor'],['result-body','body']])$(id).addEventListener('click',()=>showScreen(screen));
  for(const id of ['body-help','open-method'])$(id).addEventListener('click',()=>showOverlay('method-overlay'));
  document.addEventListener('keydown',event=>{const overlay=document.querySelector('.overlay:not([hidden])');if(!overlay)return;if(event.key==='Escape')hideOverlay(overlay.id);if(event.key==='Tab'){const controls=[...overlay.querySelectorAll('button,input,select')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
}
function registerAgentTool(){
  if(!document.modelContext?.registerTool)return;
  // IDs and constraints come from the same catalog as the visible controls.
  const properties=Object.fromEntries(exercises.map(ex=>[ex.id,{type:'object',properties:{weight:{type:'number',minimum:ex.input.weight.min,maximum:ex.input.weight.max,multipleOf:ex.input.weight.step},reps:{type:'integer',minimum:ex.input.reps.min,maximum:ex.input.reps.max}},required:['weight','reps'],additionalProperties:false}]));
  try{Promise.resolve(document.modelContext.registerTool({name:'set_record_and_calculate_rank',title:'Update exercise records and muscle ranks',description:'Update provided lift records in this browser; unprovided records are preserved. Returns muscle ranks.',inputSchema:{type:'object',properties:{gender:{type:'string',enum:['male','female']},height:{type:'number',minimum:100,maximum:230},bodyweight:{type:'number',minimum:20,maximum:400},records:{type:'object',properties,additionalProperties:false}},required:['gender','height','bodyweight','records'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){
    if(!input||!['male','female'].includes(input.gender)||numeric(input.height,100,230)===null||numeric(input.bodyweight,20,400)===null||!input.records||Array.isArray(input.records)||typeof input.records!=='object')throw new Error('Invalid profile or records');
    for(const [id,record]of Object.entries(input.records)){const ex=exercises.find(ex=>ex.id===id);if(!ex||!record||inputValue(record.weight,ex.input.weight)===null||inputValue(record.reps,ex.input.reps,true)===null)throw new Error('Invalid exercise record');}
    stopRulers();state.profile={gender:input.gender,height:String(input.height),bodyweight:String(input.bodyweight)};
    for(const[id,record]of Object.entries(input.records))state.records[id]={weight:String(record.weight),reps:String(record.reps)};
    save();renderEditor();showScreen('body');return{muscles:results().muscles.map(m=>({id:m.id,tier:rankText(m.score,m.tier)}))};
  }})).catch(()=>{});}catch{/* Visible controls remain available. */}
}
async function start(){
  try{
    const fetchJSON=async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`Could not load ${path}`);return response.json();};
    const[data,translations]=await Promise.all([fetchJSON('./data/catalog.json'),fetchJSON('./data/locales.json')]);
    catalog=validateCatalog(data);locales=translations;
    if(!locales.ko||!locales.en||Object.keys(locales.en).some(key=>!locales.ko[key]))throw new Error('Missing translations');
    exercises=catalog.exercises;tiers=catalog.tiers;
    // Only groups linked to configured exercises need interactive cards.
    muscleGroups=catalog.muscles.filter(group=>exercises.some(ex=>ex.muscles[group.id]));
    state=restoreState(catalog,read(STORAGE_KEY),read(legacyKey));save();buildBody();bindEvents();renderLocale();registerAgentTool();
    $('app-status').hidden=true;document.querySelector('main').hidden=false;
  }catch(error){console.error(error);$('app-status').replaceChildren(document.createTextNode('운동 정보를 불러오지 못했습니다. / Could not load exercise data. '));const retry=document.createElement('button');retry.textContent='다시 시도 / Try again';retry.addEventListener('click',()=>location.reload());$('app-status').append(retry);}
}
start();
