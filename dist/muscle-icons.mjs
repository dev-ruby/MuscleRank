// Reuse the bodygraph artwork so each icon highlights the actual muscle region.
const views = {
  chest:['front','190 260 348 205'],
  'front-delts':['front','182 283 135 157'],
  'side-delts':['front','182 283 135 157'],
  'rear-delts':['back','902 285 135 157'],
  lats:['back','949 345 270 280'],
  traps:['back','959 253 250 263'],
  scapular:['back','936 300 295 175'],
  erectors:['back','983 430 200 235'],
  biceps:['front','174 368 116 215'],
  triceps:['back','896 365 120 216'],
  forearms:['front','120 452 133 242'],
  abs:['front','257 387 215 255'],
  obliques:['front','257 387 215 255'],
  quads:['front','247 650 236 340'],
  glutes:['back','974 598 225 200'],
  hamstrings:['back','970 724 231 330'],
  calves:['back','968 983 236 323'],
};
export function muscleIcon(model, muscle, uid) {
  const [side,viewBox] = views[muscle.id] || ['front','165 245 405 450'];
  const body=model[side];
  const defs=body.parts.filter(part=>part.clipPaths).map(part=>`<clipPath id="${uid}-${part.slug}">${part.clipPaths.map(d=>`<path d="${d}"/>`).join('')}</clipPath>`).join('');
  const parts=body.parts.map(part=>`<g fill="${muscle.parts.includes(part.slug)?'#79ceff':'#626076'}" stroke="#d5d2e3" stroke-width="2.5" ${part.clipPaths?`clip-path="url(#${uid}-${part.slug})"`:''}>${part.paths.map(d=>`<path d="${d}"/>`).join('')}</g>`).join('');
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="17" fill="#252030"/><svg x="5" y="5" width="54" height="54" viewBox="${viewBox}"><defs>${defs}</defs><path d="${body.outline}" fill="#b6b3c5"/>${parts}</svg></svg>`;
}
