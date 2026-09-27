import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCatalog,calculate,restoreState,estimated1RM,referenceWeight,inputValue,tierIndex,summarizeRegions} from '../dist/rank-engine.mjs';
const data=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
const profile={gender:'male',height:'170',bodyweight:'70'};
const records={squat:{weight:'105',reps:'1'},bench:{weight:'75',reps:'1'},deadlift:{weight:'130',reps:'1'}};

test('first-visit profile setup survives reload until saved and respects existing profiles',()=>{
  const fresh=restoreState(data,null,null);
  assert.equal(fresh.profileCompleted,false);
  assert.equal(restoreState(data,fresh,null).profileCompleted,false);
  fresh.profileCompleted=true;
  assert.equal(restoreState(data,fresh,null).profileCompleted,true);
  assert.equal(restoreState(data,{schemaVersion:3,profile,records},null).profileCompleted,true);
  assert.equal(restoreState(data,null,{...profile,...records}).profileCompleted,true);
  assert.equal(restoreState(data,{schemaVersion:3,profile:{...profile,bodyweight:''},records,profileCompleted:true},null).profileCompleted,false);
});
test('region rank averages measured muscles and reports partial coverage',()=>{
  const sections=[{key:'shoulders',ids:['front-delts','side-delts','rear-delts']}];
  const result=calculate(data,profile,{bench:{weight:'75',reps:'1'}});
  const [partial]=summarizeRegions(sections,result.muscles,data.tiers);
  assert.equal(partial.score,1);assert.equal(partial.measured,1);assert.equal(partial.total,3);
  const [mixed]=summarizeRegions(sections,[{id:'front-delts',score:1},{id:'side-delts',score:2},{id:'rear-delts',score:null}],data.tiers);
  assert.equal(mixed.score,1.5);assert.equal(mixed.tier,tierIndex(1.5,data.tiers));
  const [empty]=summarizeRegions(sections,calculate(data,profile,{}).muscles,data.tiers);
  assert.equal(empty.score,null);assert.equal(empty.tier,null);assert.equal(empty.measured,0);
});

test('catalog and exact tier boundaries are valid',()=>{
  assert.equal(validateCatalog(data),data);
  data.tiers.forEach((tier,index)=>assert.equal(tierIndex(tier.minScore,data.tiers),index));
  assert.equal(tierIndex(.849999,data.tiers),2);
});
test('one repetition is actual weight; multi-rep uses Epley',()=>{
  assert.equal(estimated1RM(100,1),100);assert.equal(estimated1RM(100,6),120);
});
test('normalization preserves old scores for both sex categories and height/bodyweight',()=>{
  for(const gender of ['male','female']){
    const p={gender,height:'185',bodyweight:'90'};
    const expected=105*(gender==='female'?.68:1)*(90/70)**.67*(170/185)**.15;
    assert.ok(Math.abs(referenceWeight(data.exercises[0],p)-expected)<1e-10);
  }
  const result=calculate(data,profile,records);assert.equal(result.score,1);assert.equal(result.total,310);
});
test('muscle scores average available weighted scores, never add them',()=>{
  const altered=structuredClone(records);altered.squat.weight='210';
  const glutes=calculate(data,profile,altered).muscles.find(m=>m.id==='glutes');
  assert.ok(Math.abs(glutes.score-(2*.6+1*.8)/1.4)<1e-12);
  const empty=calculate(data,profile,{});assert.equal(empty.score,null);assert.equal(empty.total,null);
  assert.ok(empty.muscles.every(m=>m.tier===null));
});
test('missing/invalid lifts are excluded without invalidating other muscles',()=>{
  const altered=structuredClone(records);altered.squat.weight='';
  const result=calculate(data,profile,altered);
  assert.equal(result.count,2);assert.equal(result.total,null);
  assert.equal(result.muscles.find(m=>m.id==='glutes').score,1);
  assert.equal(result.muscles.find(m=>m.id==='quads').tier,null);
  altered.squat.weight='Infinity';assert.equal(calculate(data,profile,altered).lifts[0].valid,false);
  assert.equal(inputValue('130.2',data.exercises[0].input.weight),null);
  assert.equal(inputValue('12.5',data.exercises[0].input.reps,true),null);
});
const fourth={id:'overhead-press',name:{ko:'오버헤드 프레스',en:'Overhead Press'},title:{ko:['오버헤드','프레스'],en:['Overhead','Press']},equipment:{ko:'바벨',en:'Barbell'},input:{weight:{min:.5,max:250,step:.5,spacing:14},reps:{min:1,max:12,step:1,spacing:54}},standard:{model:'bodyweight-ratio',referenceRatio:{male:.65,female:.4}},muscles:{'front-delts':1,'side-delts':.65,triceps:.5},artwork:null};
test('adding a fourth JSON exercise requires no engine change and no default record',()=>{
  const catalog=structuredClone(data);catalog.exercises=catalog.exercises.filter(ex=>catalog.totalExerciseIds.includes(ex.id));catalog.exercises.push(fourth);validateCatalog(catalog);
  const prior={schemaVersion:3,profile,records};const state=restoreState(catalog,prior,null);
  assert.equal(state.records['overhead-press'].weight,'');
  assert.equal(calculate(catalog,profile,state.records).score,1);
  state.records['overhead-press']={weight:'91',reps:'1'};
  const result=calculate(catalog,profile,state.records);
  assert.equal(result.count,4);assert.equal(result.total,310);
  assert.equal(result.lifts[3].score,2);
  assert.ok(Math.abs(result.muscles.find(m=>m.id==='front-delts').score-(.45+2)/1.45)<1e-12);
  assert.equal(result.muscles.find(m=>m.id==='side-delts').score,2);
});
test('legacy records migrate by stable IDs, including invalid/empty in-progress values',()=>{
  const legacy={...profile,...records,bench:{weight:'',reps:'3'}};
  const state=restoreState(data,null,legacy);
  assert.equal(state.records.bench.weight,'');assert.equal(state.records.bench.reps,'3');
  assert.equal(state.profile.gender,'male');
  const reordered=structuredClone(data);reordered.exercises.reverse();
  assert.deepEqual(restoreState(reordered,state,null).records,state.records);
  const fresh=restoreState(data,null,null);
  assert.deepEqual(fresh.records.squat,{weight:'',reps:''});
  assert.deepEqual(fresh.records.bench,{weight:'',reps:''});
  assert.deepEqual(fresh.records.deadlift,{weight:'',reps:''});
});
test('expanded exercises start empty, preserve old lifts and rank all linked muscles for both genders',()=>{
  const state=restoreState(data,{schemaVersion:3,profile,records},null);
  for(const exercise of data.exercises){
    if(!data.totalExerciseIds.includes(exercise.id)) assert.deepEqual(state.records[exercise.id],{weight:'',reps:''});
    else assert.deepEqual(state.records[exercise.id],records[exercise.id]);
  }
  assert.equal(calculate(data,profile,state.records).total,310);
  for(const gender of ['male','female']){
    const p={...profile,gender};
    for(const exercise of data.exercises.filter(ex=>!data.totalExerciseIds.includes(ex.id))){
      const result=calculate(data,p,{[exercise.id]:{weight:String(referenceWeight(exercise,p)),reps:'1'}});
      assert.equal(result.count,1);assert.equal(result.total,null);assert.equal(result.score,1);
      for(const muscle of result.muscles) assert.equal(muscle.score,exercise.muscles[muscle.id]?1:null);
    }
  }
  const empty=calculate(data,profile,{});
  assert.equal(empty.muscles.length,data.muscles.length);
  assert.ok(empty.muscles.every(muscle=>muscle.tier===null));
});
test('back, shoulder and core subdivisions only receive their linked records',()=>{
  const result=calculate(data,profile,{
    bench:{weight:'75',reps:'1'},
    'overhead-press':{weight:'90',reps:'1'},
    deadlift:{weight:'260',reps:'1'},
    'lat-pulldown':{weight:'65',reps:'1'},
    'cable-crunch':{weight:'40',reps:'1'},
  });
  const muscles=Object.fromEntries(result.muscles.map(m=>[m.id,m]));
  assert.equal(muscles.lats.score,1);
  assert.equal(muscles.scapular.score,1);
  assert.equal(muscles.traps.score,2);
  assert.equal(muscles.erectors.score,2);
  assert.ok(Math.abs(muscles['front-delts'].score-(.45+2)/1.45)<1e-12);
  assert.equal(muscles['side-delts'].score,2);
  assert.equal(muscles['rear-delts'].tier,null);
  assert.equal(muscles.abs.score,1);
  assert.equal(muscles.obliques.tier,null);
  assert.deepEqual(muscles.lats.contributors.map(ex=>ex.id),['lat-pulldown']);
  assert.deepEqual(muscles.erectors.contributors.map(ex=>ex.id),['deadlift']);
});
test('bad IDs, missing translations, unknown muscles and malformed standards fail early',()=>{
  for(const mutate of [
    c=>c.exercises.push(structuredClone(c.exercises[0])),
    c=>delete c.exercises[0].name.ko,
    c=>c.exercises[0].muscles.unknown=1,
    c=>c.exercises[0].muscles.quads=-1,
    c=>c.exercises[0].standard.reference1RMKg.male=0,
    c=>c.exercises[0].input.reps.max=30,
    c=>c.tiers[3].minScore=.5,
    c=>c.exercises[0].artwork.src='https://example.com/image.png',
  ]){const broken=structuredClone(data);mutate(broken);assert.throws(()=>validateCatalog(broken),/catalog:/);}
});
