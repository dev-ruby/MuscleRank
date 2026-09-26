import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCatalog,calculate,restoreState,estimated1RM,referenceWeight,inputValue,tierIndex} from '../dist/rank-engine.mjs';
const data=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
const profile={gender:'male',height:'170',bodyweight:'70'};
const records={squat:{weight:'105',reps:'1'},bench:{weight:'75',reps:'1'},deadlift:{weight:'130',reps:'1'}};

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
const fourth={id:'overhead-press',name:{ko:'오버헤드 프레스',en:'Overhead Press'},title:{ko:['오버헤드','프레스'],en:['Overhead','Press']},equipment:{ko:'바벨',en:'Barbell'},input:{weight:{min:.5,max:250,step:.5,spacing:14},reps:{min:1,max:12,step:1,spacing:54}},standard:{model:'bodyweight-ratio',referenceRatio:{male:.65,female:.4}},muscles:{shoulders:1,triceps:.5},artwork:null};
test('adding a fourth JSON exercise requires no engine change and no default record',()=>{
  const catalog=structuredClone(data);catalog.exercises.push(fourth);validateCatalog(catalog);
  const prior={schemaVersion:3,profile,records};const state=restoreState(catalog,prior,null);
  assert.equal(state.records['overhead-press'].weight,'');
  assert.equal(calculate(catalog,profile,state.records).score,1);
  state.records['overhead-press']={weight:'91',reps:'1'};
  const result=calculate(catalog,profile,state.records);
  assert.equal(result.count,4);assert.equal(result.total,310);
  assert.equal(result.lifts[3].score,2);
  assert.ok(Math.abs(result.muscles.find(m=>m.id==='shoulders').score-(.45+2)/1.45)<1e-12);
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
