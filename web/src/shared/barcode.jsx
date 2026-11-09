import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Draws a scannable barcode: EAN-13 when the code is 13 digits (with a valid check digit), otherwise Code 128.
const validEan = c => /^\d{13}$/.test(c) && (10 - c.slice(0, 12).split('').reduce((a, d, i) => a + d * (i % 2 ? 3 : 1), 0) % 10) % 10 === Number(c[12]);
export function Barcode({ value, height = 40, width = 1.6, fontSize = 12, displayValue = true }) {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: validEan(value) ? 'EAN13' : 'CODE128', height, width, fontSize, margin: 0, displayValue, background: 'transparent' });
    } catch { ref.current.innerHTML = ''; }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} />;
}

// GS1 DataMatrix on medicine packs: (01) GTIN, (17) expiry, (10) batch, (21) serial
export function parseGS1(raw) {
  let s = String(raw || '').trim().replace(/^\]d2|^\]C1|^\]Q3/, '');
  if (!/^01\d{14}/.test(s)) return null;
  const out = {};
  while (s.length) {
    const ai = s.slice(0, 2);
    if (ai === '01') { out.gtin = s.slice(2, 16); s = s.slice(16); }
    else if (['17', '11', '15'].includes(ai)) { const d = s.slice(2, 8); if (ai === '17') out.expiry = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6) === '00' ? '28' : d.slice(4, 6)}`; s = s.slice(8); }
    else if (ai === '10' || ai === '21') { const end = s.indexOf('\x1d'); const v = end < 0 ? s.slice(2) : s.slice(2, end); out[ai === '10' ? 'batch' : 'serial'] = v; s = end < 0 ? '' : s.slice(end + 1); }
    else break;
    if (s[0] === '\x1d') s = s.slice(1);
  }
  return out;
}

// Does this typed text look like a scan rather than a name? (digits only, or a GS1 string)
export const looksLikeCode = t => /^\d{6,14}$/.test(t.trim()) || /^(\]d2)?01\d{14}/.test(t.trim()) || /^[A-Z]{2,6}\d{2,6}$/.test(t.trim());

// Print sheet of labels (opens the browser print dialog with label-sized pages)
export function printLabelSheet(html, size = '50mm 30mm') {
  const w = window.open('', '_blank', 'width=480,height=640');
  if (!w) { alert('Allow pop-ups for this site to print labels.'); return; }
  w.document.write(`<html><head><title>Labels</title><style>@page{size:${size};margin:0}body{margin:0;font-family:Arial,sans-serif}
    .lbl{width:${size.split(' ')[0]};height:${size.split(' ')[1]};box-sizing:border-box;padding:1.5mm 2mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;overflow:hidden}
    .lbl b{font-size:8.5pt;line-height:1.1;display:block;max-height:2.3em;overflow:hidden}.lbl .p{font-size:11pt;font-weight:700}.lbl small{font-size:6.5pt;color:#333}
    .lbl svg{width:100%;height:auto;max-height:12mm}</style></head><body>${html}<script>setTimeout(()=>{print()},300)</script></body></html>`);
  w.document.close();
}

// Barcode as an SVG string, for print windows
export function barcodeSvg(value, opts = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try { JsBarcode(el, value, { format: validEan(value) ? 'EAN13' : 'CODE128', height: 34, width: 1.4, fontSize: 10, margin: 0, ...opts }); } catch { return ''; }
  return el.outerHTML;
}
