import React from 'react';

// Draws a product picture from the item's form, strength and name, so every item has a visual offline.
// If a real photo was uploaded (item.image), that is shown instead.
const PALETTE = [
  ['#0f766e', '#ccfbf1'], ['#1d4ed8', '#dbeafe'], ['#7c3aed', '#ede9fe'], ['#be123c', '#ffe4e6'], ['#b45309', '#fef3c7'],
  ['#047857', '#d1fae5'], ['#0369a1', '#e0f2fe'], ['#a21caf', '#fae8ff'], ['#c2410c', '#ffedd5'], ['#4d7c0f', '#ecfccb'],
];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
const short = name => name.replace(/\(.*?\)/g, '').replace(/\d.*$/, '').trim().split(/\s+/).slice(0, 2).join(' ');

export function kindOf(it) {
  const n = (it.name || '').toLowerCase();
  if (/glove/.test(n)) return 'glove';
  if (/syringe|needle/.test(n)) return 'syringe';
  if (/thermometer/.test(n)) return 'thermo';
  if (/blood pressure|glucometer|oximeter|nebuliser machine/.test(n)) return 'device';
  if (/bandage|tape|gauze roll|cotton/.test(n)) return 'roll';
  if (/plaster/.test(n)) return 'box';
  if (/test|kit|strip|rdt/.test(n) || it.form === 'kit') return 'kit';
  if (/condom/.test(n)) return 'sachet';
  if (/diaper|wipes|pads|mask|apron/.test(n)) return 'pack';
  if (/cannula|catheter|tube|bag|set|blade|clamp|speculum|depressor|container|slides|lancet|suture/.test(n) && it.form === 'device') return 'device';
  return {
    tablet: 'box', capsule: 'box', lozenge: 'box', pessary: 'box', syrup: 'bottle', solution: 'bottle', lotion: 'bottle',
    injection: 'vial', infusion: 'ivbag', cream: 'tube', gel: 'tube', ointment: 'jar', drops: 'dropper', spray: 'dropper',
    inhaler: 'inhaler', sachet: 'sachet', powder: 'jar', gloves: 'glove', syringe: 'syringe', device: 'device', kit: 'kit',
  }[it.form] || 'box';
}

export default function ProductArt({ item, size = 120, rounded = 14 }) {
  if (item.image) return <img src={item.image} alt={item.name} width={size} height={size} style={{ objectFit: 'contain', borderRadius: rounded, background: '#fff' }} />;
  const [ink, bg] = PALETTE[hash(item.grp || item.shop_cat || item.name) % PALETTE.length];
  const k = kindOf(item);
  const label = short(item.name || '');
  const strength = (item.strength || '').slice(0, 12);
  const words = label.length > 12 ? [label.split(' ')[0], label.split(' ')[1] || ''] : [label, ''];
  const LW = { box: 74, bottle: 40, tube: 50, jar: 52, dropper: 34, sachet: 56, pack: 64, ivbag: 36 }[k] || 50;
  const fit = (t, max) => Math.min(max, LW / (Math.max(1, String(t).length) * 0.58));
  const T = ({ y, s = 9, w = 600, fill = ink, children }) => <text x="60" y={y} textAnchor="middle" fontSize={s} fontWeight={w} fill={fill} fontFamily="system-ui, sans-serif">{children}</text>;
  const shapes = {
    box: <g>
      <rect x="18" y="26" width="84" height="80" rx="6" fill="#fff" stroke={ink} strokeWidth="2" />
      <path d="M18 32 q0 -6 6 -6 h72 q6 0 6 6 v14 h-84z" fill={ink} />
      <path d="M18 96 h84 v4 q0 6 -6 6 h-72 q-6 0 -6 -6z" fill={ink} opacity=".25" />
      <ellipse cx="30" cy="36" rx="5" ry="3" fill="#fff" opacity=".85" /><ellipse cx="42" cy="36" rx="5" ry="3" fill="#fff" opacity=".6" />
    </g>,
    bottle: <g>
      <rect x="49" y="16" width="22" height="12" rx="3" fill={ink} />
      <path d="M44 30 h32 v8 q10 6 10 18 v44 q0 8 -8 8 h-36 q-8 0 -8 -8 v-44 q0 -12 10 -18z" fill="#b45309" opacity=".85" />
      <rect x="38" y="60" width="44" height="30" rx="4" fill="#fff" />
    </g>,
    vial: <g>
      <rect x="44" y="20" width="32" height="12" rx="3" fill="#94a3b8" />
      <rect x="48" y="32" width="24" height="6" fill="#cbd5e1" />
      <path d="M42 38 h36 v58 q0 8 -8 8 h-20 q-8 0 -8 -8z" fill="#fff" stroke={ink} strokeWidth="2" />
      <rect x="42" y="72" width="36" height="24" fill={ink} opacity=".15" />
      <rect x="45" y="50" width="30" height="16" rx="2" fill={ink} />
    </g>,
    ivbag: <g>
      <rect x="54" y="10" width="12" height="10" rx="2" fill="#94a3b8" />
      <path d="M34 20 h52 v62 q0 14 -14 14 h-24 q-14 0 -14 -14z" fill="#e0f2fe" stroke={ink} strokeWidth="2" />
      <rect x="40" y="36" width="40" height="22" rx="3" fill="#fff" stroke={ink} strokeWidth="1" />
      <path d="M60 96 v14" stroke="#94a3b8" strokeWidth="4" />
    </g>,
    tube: <g>
      <path d="M30 34 h60 l-6 66 h-48z" fill="#fff" stroke={ink} strokeWidth="2" />
      <rect x="34" y="20" width="52" height="14" rx="3" fill={ink} />
      <rect x="40" y="88" width="40" height="8" fill={ink} opacity=".3" />
    </g>,
    jar: <g>
      <rect x="28" y="26" width="64" height="16" rx="4" fill={ink} />
      <rect x="30" y="42" width="60" height="58" rx="8" fill="#fff" stroke={ink} strokeWidth="2" />
    </g>,
    dropper: <g>
      <path d="M54 8 h12 l2 22 h-16z" fill="#fff" stroke={ink} strokeWidth="1.5" />
      <rect x="46" y="30" width="28" height="12" rx="3" fill={ink} />
      <rect x="40" y="42" width="40" height="60" rx="8" fill="#fff" stroke={ink} strokeWidth="2" />
    </g>,
    inhaler: <g>
      <rect x="42" y="14" width="28" height="60" rx="8" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      <path d="M34 66 h48 q8 0 8 8 v22 q0 8 -8 8 h-30 q-18 0 -18 -18z" fill={ink} />
      <rect x="20" y="82" width="22" height="16" rx="3" fill={ink} opacity=".7" />
    </g>,
    sachet: <g>
      <path d="M28 24 h64 v76 h-64z" fill="#fff" stroke={ink} strokeWidth="2" />
      <path d="M28 24 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="28" y="40" width="64" height="12" fill={ink} />
    </g>,
    pack: <g>
      <rect x="24" y="24" width="72" height="80" rx="10" fill="#fff" stroke={ink} strokeWidth="2" />
      <circle cx="60" cy="56" r="16" fill={ink} opacity=".2" />
      <rect x="24" y="84" width="72" height="20" rx="0" fill={ink} opacity=".9" />
    </g>,
    glove: <g>
      <path d="M44 104 v-36 l-12 -16 q-4 -6 2 -9 q5 -2 9 4 l9 11 v-40 q0 -6 5 -6 q5 0 5 6 v28 v-36 q0 -6 5 -6 q5 0 5 6 v36 v-30 q0 -6 5 -6 q5 0 5 6 v32 v-22 q0 -6 5 -6 q5 0 5 6 v40 q0 20 -14 26 v8z" fill="#dbeafe" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    </g>,
    syringe: <g transform="rotate(-35 60 60)">
      <rect x="54" y="8" width="12" height="10" rx="2" fill="#64748b" />
      <rect x="58" y="18" width="4" height="16" fill="#94a3b8" />
      <rect x="48" y="34" width="24" height="54" rx="3" fill="#fff" stroke={ink} strokeWidth="2" />
      <rect x="50" y="62" width="20" height="24" fill={ink} opacity=".3" />
      <rect x="58" y="88" width="4" height="8" fill="#64748b" /><path d="M60 96 v18" stroke="#64748b" strokeWidth="1.5" />
    </g>,
    thermo: <g>
      <rect x="54" y="12" width="12" height="74" rx="6" fill="#fff" stroke={ink} strokeWidth="2" />
      <circle cx="60" cy="92" r="12" fill="#ef4444" /><rect x="58" y="40" width="4" height="50" fill="#ef4444" />
    </g>,
    device: <g>
      <rect x="26" y="30" width="68" height="64" rx="12" fill="#fff" stroke={ink} strokeWidth="2" />
      <rect x="36" y="40" width="48" height="24" rx="4" fill={ink} opacity=".85" />
      <text x="60" y="57" textAnchor="middle" fontSize="11" fill="#fff" fontFamily="ui-monospace, monospace">120/80</text>
      <circle cx="46" cy="78" r="5" fill={ink} opacity=".3" /><circle cx="60" cy="78" r="5" fill={ink} opacity=".3" /><circle cx="74" cy="78" r="5" fill={ink} opacity=".3" />
    </g>,
    roll: <g>
      <ellipse cx="60" cy="40" rx="30" ry="12" fill="#fff" stroke={ink} strokeWidth="2" />
      <path d="M30 40 v44 q0 12 30 12 q30 0 30 -12 v-44" fill="#fff" stroke={ink} strokeWidth="2" />
      <ellipse cx="60" cy="40" rx="10" ry="4" fill={ink} opacity=".3" />
    </g>,
    kit: <g>
      <rect x="22" y="34" width="76" height="62" rx="8" fill="#fff" stroke={ink} strokeWidth="2" />
      <rect x="32" y="48" width="56" height="16" rx="8" fill={ink} opacity=".15" />
      <rect x="40" y="53" width="10" height="6" rx="2" fill={ink} /><rect x="64" y="53" width="4" height="6" fill="#ef4444" /><rect x="72" y="53" width="4" height="6" fill="#ef4444" />
    </g>,
  };
  const showLabel = ['box', 'bottle', 'tube', 'jar', 'dropper', 'sachet', 'pack', 'ivbag'].includes(k);
  const ly = { box: 66, bottle: 74, tube: 62, jar: 68, dropper: 70, sachet: 74, pack: 50, ivbag: 46 }[k] || 70;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={item.name} style={{ borderRadius: rounded, background: bg, flex: 'none', display: 'block' }}>
      {shapes[k]}
      {showLabel && <>
        <T y={ly} s={fit(words[0], words[1] ? 8.5 : 9.5)}>{words[0]}</T>
        {words[1] && <T y={ly + 9} s={fit(words[1], 8.5)}>{words[1]}</T>}
        {strength && <T y={ly + (words[1] ? 19 : 11)} s={fit(strength, 7.5)} w={500} fill="#475569">{strength}</T>}
      </>}
      {item.rx_only ? <g><rect x="88" y="6" width="26" height="15" rx="7.5" fill="#be123c" /><T y={17} s={8.5} fill="#fff" w={700}><tspan x="101">Rx</tspan></T></g> : null}
    </svg>
  );
}
