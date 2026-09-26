// Pure calculations: no UI, locale, storage or DOM dependencies.
export function numeric(value, min, max, integer = false) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)) ? n : null;
}
export function validateCatalog(data) {
  const fail = message => { throw new Error(`catalog: ${message}`); };
  if (data?.schemaVersion !== 1 || !Array.isArray(data.exercises) || !data.exercises.length) fail('schemaVersion/exercises');
  for (const key of ['tiers', 'muscles']) if (!Array.isArray(data[key]) || !data[key].length) fail(key);
  if (data.tiers.length !== 9) fail('the badge set requires 9 tiers');
  const label = value => value && ['ko','en'].every(lang => typeof value[lang] === 'string' && value[lang].trim());
  const unique = (items, key) => {
    const ids = new Set();
    for (const item of items) {
      if (!/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) fail(`${key}: duplicate/invalid id`);
      ids.add(item.id);
    }
    return ids;
  };
  unique(data.tiers, 'tiers');
  data.tiers.forEach((tier, index) => {
    if (!label(tier.label) || !Number.isFinite(tier.minScore) || (index === 0 ? tier.minScore !== 0 : tier.minScore <= data.tiers[index-1].minScore)) fail('tier thresholds/labels');
    for (const color of ['color','light','mid','deep']) if (!/^#[a-f\d]{6}$/i.test(tier[color])) fail('tier color');
  });
  const muscles = unique(data.muscles, 'muscles'), partIds = new Set();
  for (const muscle of data.muscles) {
    if (!label(muscle.label) || !Array.isArray(muscle.parts) || !muscle.parts.length) fail('muscle label/parts');
    for (const part of muscle.parts) { if (partIds.has(part) || typeof part !== 'string') fail('duplicate muscle SVG part'); partIds.add(part); }
  }
  const exerciseIds = unique(data.exercises, 'exercises');
  for (const exercise of data.exercises) {
    if (!label(exercise.name) || !label(exercise.equipment)) fail(`${exercise.id}: translations`);
    for (const lang of ['ko','en']) if (!Array.isArray(exercise.title?.[lang]) || !exercise.title[lang].length || exercise.title[lang].some(line => typeof line !== 'string' || !line.trim())) fail(`${exercise.id}: title`);
    for (const field of ['weight','reps']) {
      const range = exercise.input?.[field];
      if (!range || !['min','max','step','spacing'].every(key => Number.isFinite(range[key])) || range.min <= 0 || range.max <= range.min || range.step <= 0 || range.spacing < 4 || (range.max-range.min)/range.step > 3000) fail(`${exercise.id}: ${field} range`);
      if ([range.min,range.max].some(value => Math.abs(value/range.step-Math.round(value/range.step)) > 1e-7)) fail(`${exercise.id}: range bounds must align to step`);
      if (field === 'reps' && (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.max > 12 || range.step !== 1)) fail('Epley reps must be integers within 1–12');
    }
    const standard = exercise.standard;
    if (!['allometric','bodyweight-ratio'].includes(standard?.model)) fail(`${exercise.id}: standard model`);
    if (standard.model === 'allometric') {
      for (const key of ['referenceBodyweightKg','referenceHeightCm']) if (!Number.isFinite(standard[key]) || !(standard[key] > 0)) fail(`${exercise.id}: ${key}`);
      for (const key of ['bodyweightExponent','heightExponent']) if (!Number.isFinite(standard[key]) || Math.abs(standard[key]) > 2) fail(`${exercise.id}: ${key}`);
    }
    const reference = standard.model === 'allometric' ? standard.reference1RMKg : standard.referenceRatio;
    if (!reference || !['male','female'].every(sex => Number.isFinite(reference[sex]) && reference[sex] > 0)) fail(`${exercise.id}: sex standards`);
    if (!exercise.muscles || !Object.keys(exercise.muscles).length) fail(`${exercise.id}: muscles`);
    for (const [id, weight] of Object.entries(exercise.muscles)) if (!muscles.has(id) || !Number.isFinite(weight) || weight <= 0 || weight > 1) fail(`${exercise.id}: muscle weight ${id}`);
    if (exercise.artwork) {
      const art = exercise.artwork;
      if (typeof art.src !== 'string' || !/^\.\/[a-z\d_./-]+\.(png|webp|svg|jpg)$/i.test(art.src) || art.src.includes('..') || !Number.isInteger(art.columns) || art.columns < 1 || !Number.isInteger(art.index) || art.index < 0 || art.index >= art.columns) fail(`${exercise.id}: artwork`);
    }
  }
  if (!Array.isArray(data.totalExerciseIds) || !data.totalExerciseIds.length || new Set(data.totalExerciseIds).size !== data.totalExerciseIds.length || data.totalExerciseIds.some(id => !exerciseIds.has(id))) fail('totalExerciseIds');
  return data;
}
export function inputValue(value, range, integer = false) {
  const n = numeric(value, range.min, range.max, integer);
  if (n === null) return null;
  const ticks = n / range.step;
  return Math.abs(ticks - Math.round(ticks)) < 1e-7 ? n : null;
}
export const estimated1RM = (weight, reps) => reps === 1 ? weight : weight * (1 + reps / 30);
export function tierIndex(score, tiers) { return tiers.reduce((index, tier, i) => score >= tier.minScore ? i : index, 0); }
export function subdivision(score, index, tiers) {
  if (index === tiers.length - 1) return '';
  const fraction = Math.max(0, Math.min(.999, (score-tiers[index].minScore)/(tiers[index+1].minScore-tiers[index].minScore)));
  return ['III','II','I'][Math.floor(fraction*3)];
}
export function referenceWeight(exercise, profile) {
  const s = exercise.standard;
  if (s.model === 'bodyweight-ratio') return Number(profile.bodyweight) * s.referenceRatio[profile.gender];
  return s.reference1RMKg[profile.gender] * Math.pow(Number(profile.bodyweight)/s.referenceBodyweightKg, s.bodyweightExponent) * Math.pow(s.referenceHeightCm/Number(profile.height), s.heightExponent);
}
export function calculate(catalog, profile, records) {
  const profileValid = ['male','female'].includes(profile.gender) && numeric(profile.height,100,230) !== null && numeric(profile.bodyweight,20,400) !== null;
  const lifts = catalog.exercises.map(exercise => {
    const record = records[exercise.id] || {};
    const weight = inputValue(record.weight, exercise.input.weight), reps = inputValue(record.reps, exercise.input.reps, true);
    if (!profileValid || weight === null || reps === null) return { ...exercise, valid: false };
    const oneRepMax = estimated1RM(weight, reps), reference = referenceWeight(exercise, profile), score = oneRepMax/reference;
    return { ...exercise, valid: true, weight, reps, oneRepMax, reference, score, tier: tierIndex(score,catalog.tiers) };
  });
  const muscles = catalog.muscles.map(muscle => {
    const contributors = lifts.filter(lift => lift.valid && lift.muscles[muscle.id] > 0);
    const weight = contributors.reduce((sum,lift) => sum + lift.muscles[muscle.id],0);
    // Normalize by the available weights: adding an unrecorded exercise changes nothing.
    const score = weight ? contributors.reduce((sum,lift) => sum + lift.score*lift.muscles[muscle.id],0)/weight : null;
    return { ...muscle, contributors, score, tier: score === null ? null : tierIndex(score,catalog.tiers) };
  });
  const scored = lifts.filter(lift => lift.valid);
  const score = scored.length ? Math.exp(scored.reduce((sum,lift) => sum+Math.log(lift.score),0)/scored.length) : null;
  const totalLifts = catalog.totalExerciseIds.map(id => lifts.find(lift => lift.id === id));
  const total = totalLifts.every(lift => lift.valid) ? totalLifts.reduce((sum,lift) => sum+lift.oneRepMax,0) : null;
  return { lifts, muscles, score, tier: score === null ? null : tierIndex(score,catalog.tiers), total, totalLifts, count: scored.length };
}
export function restoreState(catalog, saved, legacy) {
  const defaultProfile = { gender:'male', height:'175', bodyweight:'75' };
  const isCurrent = saved?.schemaVersion === 3 && saved.profile && saved.records;
  const source = isCurrent ? saved.profile : legacy;
  const profile = source && ['male','female'].includes(source.gender) ? {gender:source.gender,height:String(source.height ?? '175'),bodyweight:String(source.bodyweight ?? '75')} : defaultProfile;
  const records = isCurrent ? { ...saved.records } : {};
  for (const exercise of catalog.exercises) {
    const prior = isCurrent ? saved.records[exercise.id] : legacy?.[exercise.id];
    records[exercise.id] = { weight:String(prior?.weight ?? ''),reps:String(prior?.reps ?? '') };
  }
  return {schemaVersion:3,profile,records};
}
