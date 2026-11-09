// Pentarch MediCore - shop-floor commerce: shifts and cash-up, returns, barcodes, purchase orders,
// stock transfers between branches, expenses and profit. Registered by index.js.
module.exports = function commerce(app, H) {
  const { D, R, all, get, run, tx, now, today, wrap, fail, userOf, audit, deduct, fmtQty, stockOf, billTotals, addLine, pad, adminOnly, itemsWithStock, cfg } = H;

  // ---------- supervisor approval: any active administrator's PIN in this organisation ----------
  function supervisor(req, pin) {
    if (['admin', 'superadmin'].includes(req.user.role)) return req.user.name;
    if (!pin) fail('A supervisor PIN is needed for this', 403);
    const orgId = req.user.org_id || req.branch?.org_id;
    const u = R.all("SELECT * FROM users WHERE org_id=? AND active=1 AND role='admin'", orgId).find(x => x.pin_hash === D.hashPin(String(pin)));
    if (!u) fail('That supervisor PIN is not correct', 403);
    return u.name;
  }
  H.supervisor = supervisor;

  // ================= shifts and cash-up =================
  const openShift = req => get("SELECT * FROM shifts WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1", req.user.id);
  H.openShift = openShift;
  function shiftSummary(s) {
    const until = s.closed_at || '9999';
    const pays = all('SELECT method, SUM(amount) amount, COUNT(*) n FROM payments WHERE shift_id=? GROUP BY method ORDER BY amount DESC', s.id);
    const cashIn = pays.filter(p => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
    const paidOut = get("SELECT COALESCE(SUM(amount),0) a FROM expenses WHERE shift_id=? AND method='cash'", s.id).a;
    const refunds = get("SELECT COALESCE(SUM(-amount),0) a, COUNT(*) n FROM payments WHERE shift_id=? AND amount<0", s.id);
    const sales = get('SELECT COUNT(DISTINCT bill_id) n, COALESCE(SUM(amount),0) a FROM payments WHERE shift_id=? AND amount>0', s.id);
    const expected = Math.round(((s.opening_float || 0) + cashIn - paidOut) * 100) / 100;
    return { ...s, byMethod: pays, cashIn, paidOut, refunds: refunds.a, refundCount: refunds.n, receipts: sales.n, taken: sales.a, expected,
      variance: s.counted_cash == null ? null : Math.round((s.counted_cash - expected) * 100) / 100, until };
  }
  app.get('/api/shifts/current', wrap(req => { const s = openShift(req); return s ? shiftSummary(s) : null; }));
  app.post('/api/shifts/open', wrap(req => {
    if (openShift(req)) fail('You already have a shift open');
    const f = Number(req.body.opening_float);
    if (!(f >= 0) || req.body.opening_float === '' || req.body.opening_float == null) fail('Count the float in the drawer and enter it (0 if empty)');
    const id = run("INSERT INTO shifts(user,user_id,opened_at,opening_float,status) VALUES(?,?,?,?,'open')", userOf(req), req.user.id, now(), f).lastInsertRowid;
    audit(req, 'shift-open', 'shift', id);
    return shiftSummary(get('SELECT * FROM shifts WHERE id=?', id));
  }));
  app.post('/api/shifts/close', wrap(req => {
    const s = openShift(req);
    if (!s) fail('No open shift');
    const counted = Number(req.body.counted_cash);
    if (req.body.counted_cash === '' || req.body.counted_cash == null || !(counted >= 0)) fail('Count the cash in the drawer and enter the total');
    const sum = shiftSummary(s);
    const variance = Math.round((counted - sum.expected) * 100) / 100;
    if (Math.abs(variance) >= 1 && !req.body.notes) fail(`The drawer is ${variance > 0 ? 'over' : 'short'} by KES ${Math.abs(variance)}. Add a note explaining it before closing.`);
    run("UPDATE shifts SET closed_at=?, counted_cash=?, expected_cash=?, variance=?, notes=?, status='closed' WHERE id=?", now(), counted, sum.expected, variance, req.body.notes, s.id);
    audit(req, `shift-close variance ${variance}`, 'shift', s.id);
    return shiftSummary(get('SELECT * FROM shifts WHERE id=?', s.id));
  }));
  app.get('/api/shifts', wrap(req => all('SELECT * FROM shifts ORDER BY id DESC LIMIT 60').map(shiftSummary)));
  app.get('/api/shifts/:id', wrap(req => { const s = get('SELECT * FROM shifts WHERE id=?', req.params.id); if (!s) fail('Shift not found', 404); return shiftSummary(s); }));

  // ================= returns and refunds =================
  function refundable(billId) {
    const lines = all("SELECT * FROM bill_lines WHERE bill_id=? AND amount>0 ORDER BY id", billId);
    const done = {};
    for (const r of all('SELECT lines FROM refunds WHERE bill_id=?', billId)) for (const l of JSON.parse(r.lines)) done[l.line_id] = (done[l.line_id] || 0) + l.qty;
    return lines.map(l => ({ ...l, refunded: done[l.id] || 0, left: Math.round((l.qty - (done[l.id] || 0)) * 1000) / 1000 }));
  }
  app.get('/api/bills/:id/refundable', wrap(req => ({ lines: refundable(Number(req.params.id)), refunds: all('SELECT * FROM refunds WHERE bill_id=? ORDER BY id', req.params.id) })));
  app.post('/api/bills/:id/refund', wrap(req => {
    const billId = Number(req.params.id);
    const bill = get('SELECT * FROM bills WHERE id=?', billId);
    if (!bill) fail('Receipt not found', 404);
    if (bill.status !== 'paid') fail('Only paid receipts can be refunded');
    const { lines = [], method = 'cash', reason, restock = true, pin, reference } = req.body;
    if (!reason?.trim()) fail('Give the reason for the return');
    const approver = supervisor(req, pin);
    const avail = Object.fromEntries(refundable(billId).map(l => [l.id, l]));
    const picked = lines.filter(l => Number(l.qty) > 0);
    if (!picked.length) fail('Choose what is being returned');
    let amount = 0;
    const saved = [];
    let refundId;
    tx(() => {
      for (const p of picked) {
        const l = avail[p.line_id];
        if (!l) fail('That line is not on this receipt');
        const q = Number(p.qty);
        if (q > l.left + 1e-9) fail(`Only ${l.left} of “${l.description}” can still be returned`);
        amount += Math.round(q * l.unit_price * 100) / 100;
        saved.push({ line_id: l.id, qty: q, description: l.description, amount: Math.round(q * l.unit_price * 100) / 100 });
        if (restock && l.ref_table === 'items' && l.ref_id) {
          const it = get('SELECT * FROM items WHERE id=?', l.ref_id);
          const byPack = /\(\w+ of \d+\)/.test(l.description) && it.pack_size > 1;
          let units = byPack ? q * it.pack_size : q;
          // put stock back into the batches it came from, newest first
          const moves = all("SELECT batch_id, -SUM(qty) q FROM stock_moves WHERE item_id=? AND ref LIKE ? AND qty<0 GROUP BY batch_id ORDER BY batch_id DESC", it.id, `%-${billId}`);
          for (const m of moves) {
            if (units <= 0) break;
            const back = Math.min(units, m.q);
            run('UPDATE batches SET qty=qty+? WHERE id=?', back, m.batch_id);
            run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', it.id, m.batch_id, back, 'return', 'RET-' + billId, userOf(req), now());
            units -= back;
          }
        }
      }
      amount = Math.round(amount * 100) / 100;
      refundId = run('INSERT INTO refunds(bill_id,amount,method,reason,restock,lines,by_user,approved_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        billId, amount, method, reason.trim(), restock ? 1 : 0, JSON.stringify(saved), userOf(req), approver, now()).lastInsertRowid;
      run('UPDATE refunds SET refund_no=? WHERE id=?', 'RF' + pad(refundId), refundId);
      addLine(billId, `Return RF${pad(refundId)}: ${saved.map(s => `${s.qty} × ${s.description}`).join('; ')}`, 'refund', 'refunds', refundId, 1, -amount, userOf(req));
      run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at,shift_id) VALUES(?,?,?,?,?,?,?)',
        billId, method, -amount, reference || 'RF' + pad(refundId), userOf(req), now(), openShift(req)?.id ?? null);
    });
    audit(req, `refund KES ${amount} approved by ${approver}: ${reason}`, 'bill', billId);
    return { ok: true, refund_no: 'RF' + pad(refundId), amount };
  }));
  // find a receipt to return against
  app.get('/api/receipts/search', wrap(req => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return [];
    return all(`SELECT b.id, b.receipt_no, b.closed_at, b.status, COALESCE(p.first_name||' '||p.last_name, b.customer_name) name FROM bills b LEFT JOIN patients p ON p.id=b.patient_id
      WHERE b.status='paid' AND (b.receipt_no LIKE ? OR b.customer_name LIKE ? OR p.first_name||' '||p.last_name LIKE ? OR EXISTS(SELECT 1 FROM payments x WHERE x.bill_id=b.id AND x.reference LIKE ?))
      ORDER BY b.id DESC LIMIT 15`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`).map(b => ({ ...b, ...billTotals(b.id) }));
  }));

  // ================= barcodes =================
  // GS1: (01) GTIN-14, (17) expiry YYMMDD, (10) batch, (21) serial. Scanners send FNC1 as ASCII 29 (GS).
  function parseGS1(raw) {
    let s = String(raw || '').trim().replace(/^\]d2|^\]C1|^\]Q3/, '');
    if (!/^01\d{14}/.test(s)) return null;
    const out = {};
    while (s.length) {
      const ai = s.slice(0, 2);
      if (ai === '01') { out.gtin = s.slice(2, 16); s = s.slice(16); }
      else if (ai === '17' || ai === '11' || ai === '15') { const d = s.slice(2, 8); if (ai === '17') out.expiry = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6) === '00' ? '28' : d.slice(4, 6)}`; s = s.slice(8); }
      else if (ai === '10' || ai === '21') { const end = s.indexOf('\x1d'); const v = end < 0 ? s.slice(2) : s.slice(2, end); out[ai === '10' ? 'batch' : 'serial'] = v; s = end < 0 ? '' : s.slice(end + 1); }
      else break;
      if (s[0] === '\x1d') s = s.slice(1);
    }
    return out;
  }
  H.parseGS1 = parseGS1;
  const gtinVariants = c => { const d = String(c).replace(/\D/g, ''); return [...new Set([d, d.replace(/^0+/, ''), d.padStart(13, '0'), d.padStart(14, '0')])]; };
  function findByCode(code) {
    const raw = String(code || '').trim();
    if (!raw) return null;
    const gs = parseGS1(raw);
    const codes = gs ? gtinVariants(gs.gtin) : gtinVariants(raw).concat(raw);
    const qs = codes.map(() => '?').join(',');
    const it = get(`SELECT * FROM items WHERE active=1 AND (barcode IN (${qs}) OR gtin IN (${qs}) OR code=?) LIMIT 1`, ...codes, ...codes, raw);
    return it ? { item: { ...it, stock: stockOf(it.id), stock_text: fmtQty(it, stockOf(it.id)) }, gs1: gs } : { item: null, gs1: gs };
  }
  app.get('/api/items/by-code/:code', wrap(req => findByCode(decodeURIComponent(req.params.code))));
  // EAN-13 for shop-made labels: prefix 2 (in-store use), branch-independent item code
  function ean13(base12) { const d = base12.split('').map(Number); const sum = d.reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0); return base12 + ((10 - sum % 10) % 10); }
  app.post('/api/items/:id/barcode', wrap(req => {
    const it = get('SELECT * FROM items WHERE id=?', req.params.id);
    if (!it) fail('Item not found', 404);
    let code = String(req.body.barcode || '').trim();
    if (req.body.generate) code = ean13('2' + String(it.id).padStart(11, '0'));
    else {
      const gs = parseGS1(code); if (gs) code = gs.gtin.replace(/^0/, '');
      if (!/^[0-9A-Za-z\-]{4,32}$/.test(code)) fail('Scan or type a valid barcode');
    }
    const other = get('SELECT name FROM items WHERE barcode=? AND id!=?', code, it.id);
    if (other) fail(`That barcode already belongs to ${other.name}`);
    run('UPDATE items SET barcode=? WHERE id=?', code, it.id);
    audit(req, 'barcode ' + code, 'item', it.id);
    return { barcode: code };
  }));

  // ================= customers (pharmacy accounts and loyalty) =================
  app.get('/api/customers', wrap(req => {
    const q = String(req.query.q || '').trim();
    const rows = q ? all('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 30', `%${q}%`, `%${q}%`) : all('SELECT * FROM customers ORDER BY id DESC LIMIT 100');
    return rows.map(c => {
      const b = all("SELECT id FROM bills WHERE customer_id=?", c.id);
      const owed = b.map(x => billTotals(x.id).balance).reduce((a, x) => a + Math.max(0, x), 0);
      const spent = get("SELECT COALESCE(SUM(p.amount),0) a FROM payments p JOIN bills b ON b.id=p.bill_id WHERE b.customer_id=?", c.id).a;
      return { ...c, owed, spent, visits: b.length };
    });
  }));
  app.post('/api/customers', wrap(req => {
    const { name, phone, credit_limit, notes } = req.body;
    if (!name?.trim() || !phone) fail('Customer name and phone are required');
    const ph = String(phone).replace(/\s/g, '');
    if (!H.PHONE.test(ph)) fail('Enter a valid Kenyan phone number');
    if (get('SELECT id FROM customers WHERE phone=?', ph)) fail('A customer with that phone already exists');
    const id = run('INSERT INTO customers(name,phone,credit_limit,notes,created_at) VALUES(?,?,?,?,?)', name.trim(), ph, Number(credit_limit) || 0, notes, now()).lastInsertRowid;
    return get('SELECT * FROM customers WHERE id=?', id);
  }));
  app.put('/api/customers/:id', adminOnly, wrap(req => {
    const c = get('SELECT * FROM customers WHERE id=?', req.params.id);
    run('UPDATE customers SET name=?, credit_limit=?, notes=? WHERE id=?', req.body.name ?? c.name, Number(req.body.credit_limit ?? c.credit_limit), req.body.notes ?? c.notes, c.id);
    return { ok: true };
  }));

  // ================= purchase orders =================
  const poView = po => {
    const lines = all('SELECT l.*, i.name, i.pack_size, i.pack_name, i.unit, i.code, i.barcode FROM po_lines l JOIN items i ON i.id=l.item_id WHERE l.po_id=? ORDER BY i.name', po.id)
      .map(l => ({ ...l, stock: stockOf(l.item_id), stock_text: fmtQty(l, stockOf(l.item_id)), received_text: fmtQty(l, l.received), total: Math.round(l.packs * l.pack_cost) }));
    return { ...po, lines, total: lines.reduce((a, l) => a + l.total, 0) };
  };
  app.get('/api/purchase-orders', wrap(() => all('SELECT * FROM purchase_orders ORDER BY id DESC LIMIT 100').map(poView)));
  app.get('/api/purchase-orders/:id', wrap(req => { const po = get('SELECT * FROM purchase_orders WHERE id=?', req.params.id); if (!po) fail('Order not found', 404); return poView(po); }));
  app.get('/api/purchase-orders-suggest', wrap(() => itemsWithStock().filter(i => i.reorder_level > 0 && i.stock <= i.reorder_level).map(i => {
    const target = i.reorder_level * 2;
    const packs = Math.max(1, Math.ceil((target - i.stock) / (i.pack_size || 1)));
    const last = get('SELECT supplier FROM batches WHERE item_id=? AND supplier IS NOT NULL ORDER BY id DESC LIMIT 1', i.id);
    return { item_id: i.id, name: i.name, stock_text: fmtQty(i, i.stock), reorder_text: fmtQty(i, i.reorder_level), packs, pack_name: i.pack_name, pack_size: i.pack_size, pack_cost: Math.round((i.cost || 0) * (i.pack_size || 1)), supplier: last?.supplier || null };
  })));
  app.post('/api/purchase-orders', wrap(req => {
    const { supplier, lines = [], notes, expected } = req.body;
    if (!supplier?.trim()) fail('Choose the supplier');
    const ok = lines.filter(l => l.item_id && Number(l.packs) > 0);
    if (!ok.length) fail('Add at least one item with a quantity');
    let id;
    tx(() => {
      if (!get('SELECT id FROM suppliers WHERE name=?', supplier.trim())) run('INSERT INTO suppliers(name) VALUES(?)', supplier.trim());
      id = run("INSERT INTO purchase_orders(supplier,status,notes,expected,created_by,created_at) VALUES(?,'draft',?,?,?,?)", supplier.trim(), notes, expected, userOf(req), now()).lastInsertRowid;
      run('UPDATE purchase_orders SET po_no=? WHERE id=?', 'PO' + pad(id, 5), id);
      for (const l of ok) run('INSERT INTO po_lines(po_id,item_id,packs,pack_cost) VALUES(?,?,?,?)', id, l.item_id, Number(l.packs), Number(l.pack_cost) || 0);
    });
    return poView(get('SELECT * FROM purchase_orders WHERE id=?', id));
  }));
  app.post('/api/purchase-orders/:id/status', wrap(req => {
    const po = get('SELECT * FROM purchase_orders WHERE id=?', req.params.id);
    const st = req.body.status;
    if (!['sent', 'cancelled'].includes(st)) fail('Unknown status');
    if (po.status === 'received') fail('This order is already received');
    run('UPDATE purchase_orders SET status=?, sent_at=COALESCE(sent_at, ?) WHERE id=?', st, st === 'sent' ? now() : null, po.id);
    return poView(get('SELECT * FROM purchase_orders WHERE id=?', po.id));
  }));
  // receive against the order: each line gets packs, batch number and expiry
  app.post('/api/purchase-orders/:id/receive', wrap(req => {
    const po = get('SELECT * FROM purchase_orders WHERE id=?', req.params.id);
    if (!po || ['received', 'cancelled'].includes(po.status)) fail('This order cannot be received');
    const got = (req.body.lines || []).filter(l => Number(l.packs) > 0 || Number(l.loose) > 0);
    if (!got.length) fail('Enter what arrived');
    tx(() => {
      for (const l of got) {
        const pl = get('SELECT l.*, i.pack_size, i.name FROM po_lines l JOIN items i ON i.id=l.item_id WHERE l.id=? AND l.po_id=?', l.line_id, po.id);
        if (!pl) fail('Line not on this order');
        if (!l.expiry) fail(`Expiry date is required for ${pl.name}`);
        if (l.expiry <= today()) fail(`${pl.name}: that batch has already expired`);
        const qty = (Number(l.packs) || 0) * pl.pack_size + (Number(l.loose) || 0);
        const cost = Number(l.pack_cost || pl.pack_cost) / pl.pack_size;
        const b = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at,po_id) VALUES(?,?,?,?,?,?,?,?)',
          pl.item_id, l.batch_no || 'B' + Date.now().toString().slice(-6), l.expiry, qty, cost, po.supplier, now(), po.id).lastInsertRowid;
        run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', pl.item_id, b, qty, 'receive', `${po.po_no} ${po.supplier}${req.body.invoice ? ' inv ' + req.body.invoice : ''}`, userOf(req), now());
        run('UPDATE po_lines SET received=received+? WHERE id=?', qty, pl.id);
        if (cost > 0) run('UPDATE items SET cost=? WHERE id=?', cost, pl.item_id);
      }
      const open = all('SELECT l.*, i.pack_size FROM po_lines l JOIN items i ON i.id=l.item_id WHERE l.po_id=?', po.id).some(l => l.received < l.packs * l.pack_size);
      run('UPDATE purchase_orders SET status=?, closed_at=? WHERE id=?', open ? 'partial' : 'received', open ? null : now(), po.id);
    });
    audit(req, 'receive ' + po.po_no, 'purchase_order', po.id);
    return poView(get('SELECT * FROM purchase_orders WHERE id=?', po.id));
  }));

  // ================= stock transfers between branches of one organisation =================
  const branchName = id => R.get('SELECT name FROM branches WHERE id=?', id)?.name;
  const tView = t => ({ ...t, lines: JSON.parse(t.lines), from_name: branchName(t.from_branch), to_name: branchName(t.to_branch) });
  app.get('/api/transfers', wrap(req => R.all('SELECT * FROM transfers WHERE from_branch=? OR to_branch=? ORDER BY id DESC LIMIT 100', req.branch.id, req.branch.id).map(tView)));
  app.post('/api/transfers', wrap(req => {
    const { to_branch, lines = [], notes } = req.body;
    const dest = R.get('SELECT * FROM branches WHERE id=?', Number(to_branch));
    if (!dest || dest.org_id !== req.branch.org_id || dest.id === req.branch.id) fail('Choose another branch of this organisation');
    const ok = lines.filter(l => Number(l.qty) > 0);
    if (!ok.length) fail('Add the items to send');
    const out = [];
    tx(() => {
      for (const l of ok) {
        const it = get('SELECT * FROM items WHERE id=?', l.item_id);
        const units = l.mode === 'pack' ? Number(l.qty) * it.pack_size : Number(l.qty);
        const before = all('SELECT id, batch_no, expiry, cost, qty FROM batches WHERE item_id=? AND qty>0 AND expiry>=? ORDER BY expiry, id', it.id, today());
        deduct(it.id, units, 'transfer-out', 'TRF to ' + dest.name, userOf(req));
        const batches = [];
        for (const b of before) { const now2 = get('SELECT qty FROM batches WHERE id=?', b.id).qty; const taken = b.qty - now2; if (taken > 0) batches.push({ batch_no: b.batch_no, expiry: b.expiry, cost: b.cost, qty: taken }); }
        out.push({ code: it.code, name: it.name, units, qty_text: fmtQty(it, units), batches });
      }
    });
    const id = R.run("INSERT INTO transfers(org_id,from_branch,to_branch,status,lines,notes,created_by,created_at) VALUES(?,?,?,'in_transit',?,?,?,?)",
      req.branch.org_id, req.branch.id, dest.id, JSON.stringify(out), notes, userOf(req), now()).lastInsertRowid;
    audit(req, `transfer TRF${id} to ${dest.name}`, 'transfer', id);
    return tView(R.get('SELECT * FROM transfers WHERE id=?', id));
  }));
  app.post('/api/transfers/:id/receive', wrap(req => {
    const t = R.get('SELECT * FROM transfers WHERE id=?', req.params.id);
    if (!t || t.to_branch !== req.branch.id) fail('This transfer is not addressed to this branch');
    if (t.status !== 'in_transit') fail('Already received');
    tx(() => {
      for (const l of JSON.parse(t.lines)) {
        let it = get('SELECT * FROM items WHERE code=?', l.code) || get('SELECT * FROM items WHERE name=?', l.name);
        if (!it) fail(`${l.name} is not in this branch's item list. Add it first, then receive.`);
        for (const b of l.batches) {
          const bid = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)', it.id, b.batch_no, b.expiry, b.qty, b.cost, 'Transfer from ' + branchName(t.from_branch), now()).lastInsertRowid;
          run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', it.id, bid, b.qty, 'transfer-in', 'TRF' + t.id + ' from ' + branchName(t.from_branch), userOf(req), now());
        }
      }
    });
    R.run("UPDATE transfers SET status='received', received_by=?, received_at=? WHERE id=?", userOf(req), now(), t.id);
    return tView(R.get('SELECT * FROM transfers WHERE id=?', t.id));
  }));
  app.post('/api/transfers/:id/cancel', wrap(req => {
    const t = R.get('SELECT * FROM transfers WHERE id=?', req.params.id);
    if (!t || t.from_branch !== req.branch.id || t.status !== 'in_transit') fail('Only the sending branch can cancel a transfer still in transit');
    tx(() => {
      for (const l of JSON.parse(t.lines)) {
        const it = get('SELECT * FROM items WHERE code=?', l.code) || get('SELECT * FROM items WHERE name=?', l.name);
        for (const b of l.batches) {
          const bid = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)', it.id, b.batch_no, b.expiry, b.qty, b.cost, 'Cancelled transfer', now()).lastInsertRowid;
          run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', it.id, bid, b.qty, 'transfer-cancel', 'TRF' + t.id, userOf(req), now());
        }
      }
    });
    R.run("UPDATE transfers SET status='cancelled', received_by=?, received_at=? WHERE id=?", userOf(req), now(), t.id);
    return { ok: true };
  }));

  // ================= expenses =================
  const EXP_CATS = ['Rent', 'Salaries and wages', 'Electricity and water', 'Internet and phone', 'Transport and delivery', 'Cleaning and supplies', 'Repairs and maintenance', 'Licences and fees', 'Marketing', 'Bank and M-Pesa charges', 'Other'];
  app.get('/api/expenses', wrap(req => {
    const from = req.query.from || D.addDays(now(), -30), to = req.query.to || today();
    return { categories: EXP_CATS, rows: all('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC', from, to) };
  }));
  app.post('/api/expenses', wrap(req => {
    const { date, category, description, amount, method, reference } = req.body;
    if (!(Number(amount) > 0)) fail('Enter the amount');
    if (!category) fail('Choose a category');
    const shift = method === 'cash' ? openShift(req) : null;
    const id = run('INSERT INTO expenses(date,category,description,amount,method,reference,shift_id,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      date || today(), category, description, Number(amount), method || 'cash', reference, shift?.id ?? null, userOf(req), now()).lastInsertRowid;
    audit(req, `expense KES ${amount} ${category}`, 'expense', id);
    return get('SELECT * FROM expenses WHERE id=?', id);
  }));
  app.delete('/api/expenses/:id', adminOnly, wrap(req => { run('DELETE FROM expenses WHERE id=?', req.params.id); audit(req, 'expense deleted', 'expense', Number(req.params.id)); return { ok: true }; }));

  // ================= profit and loss =================
  app.get('/api/reports/profit', wrap(req => {
    const from = req.query.from || D.addDays(now(), -29), to = req.query.to || today();
    const range = [from, to + 'T23:59:59'];
    const sales = get("SELECT COALESCE(SUM(amount),0) a FROM bill_lines WHERE amount>0 AND kind NOT IN ('discount','refund') AND created_at BETWEEN ? AND ?", ...range).a;
    const discounts = -get("SELECT COALESCE(SUM(amount),0) a FROM bill_lines WHERE kind='discount' AND created_at BETWEEN ? AND ?", ...range).a;
    const refunds = -get("SELECT COALESCE(SUM(amount),0) a FROM bill_lines WHERE kind='refund' AND created_at BETWEEN ? AND ?", ...range).a;
    const cogsRows = all(`SELECT i.id, i.name, i.grp, SUM(-m.qty) units, SUM(-m.qty * COALESCE(b.cost, i.cost, 0)) cost FROM stock_moves m JOIN items i ON i.id=m.item_id LEFT JOIN batches b ON b.id=m.batch_id
      WHERE m.type IN ('sale','dispense','consumable','return') AND m.created_at BETWEEN ? AND ? GROUP BY i.id`, ...range);
    const cogs = cogsRows.reduce((a, r) => a + r.cost, 0);
    const lossRows = all(`SELECT m.type, SUM(-m.qty * COALESCE(b.cost, i.cost, 0)) cost FROM stock_moves m JOIN items i ON i.id=m.item_id LEFT JOIN batches b ON b.id=m.batch_id
      WHERE m.type='adjust' AND m.qty<0 AND m.created_at BETWEEN ? AND ? GROUP BY m.type`, ...range);
    const shrinkage = lossRows.reduce((a, r) => a + r.cost, 0);
    const exp = all('SELECT category, SUM(amount) amount FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC', from, to);
    const expenses = exp.reduce((a, r) => a + r.amount, 0);
    const itemSales = all(`SELECT l.ref_id id, SUM(l.amount) revenue FROM bill_lines l WHERE l.ref_table='items' AND l.amount>0 AND l.created_at BETWEEN ? AND ? GROUP BY l.ref_id`, ...range);
    const byItem = {};
    for (const r of cogsRows) byItem[r.id] = { id: r.id, name: r.name, grp: r.grp, units: r.units, cost: r.cost, revenue: 0 };
    for (const r of itemSales) (byItem[r.id] ||= { id: r.id, name: get('SELECT name FROM items WHERE id=?', r.id)?.name, units: 0, cost: 0, revenue: 0 }).revenue += r.revenue;
    // dispensed prescriptions are billed per visit; add their revenue by item
    for (const r of all(`SELECT p.item_id id, SUM(l.amount) revenue FROM bill_lines l JOIN prescriptions p ON p.id=l.ref_id WHERE l.ref_table='prescriptions' AND l.created_at BETWEEN ? AND ? GROUP BY p.item_id`, ...range))
      (byItem[r.id] ||= { id: r.id, name: get('SELECT name FROM items WHERE id=?', r.id)?.name, units: 0, cost: 0, revenue: 0 }).revenue += r.revenue;
    const items = Object.values(byItem).filter(r => r.revenue > 0).map(r => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue ? Math.round((r.revenue - r.cost) / r.revenue * 100) : 0 })).sort((a, b) => b.profit - a.profit);
    const netSales = sales - discounts - refunds;
    const gross = netSales - cogs;
    const dead = itemsWithStock().filter(i => i.stock > 0 && !get("SELECT 1 FROM stock_moves WHERE item_id=? AND type IN ('sale','dispense') AND created_at>=? LIMIT 1", i.id, D.addDays(now(), -90)))
      .map(i => ({ id: i.id, name: i.name, stock_text: fmtQty(i, i.stock), value: Math.round(i.stock * (i.cost || 0)) })).sort((a, b) => b.value - a.value).slice(0, 25);
    const bySource = all("SELECT kind, SUM(amount) amount FROM bill_lines WHERE amount>0 AND kind NOT IN ('discount','refund') AND created_at BETWEEN ? AND ? GROUP BY kind ORDER BY amount DESC", ...range);
    return { from, to, sales, discounts, refunds, netSales, cogs, gross, grossMargin: netSales ? Math.round(gross / netSales * 100) : 0, shrinkage, expenses, expenseByCat: exp,
      net: gross - expenses - shrinkage, items: items.slice(0, 40), worst: [...items].sort((a, b) => a.margin - b.margin).slice(0, 10), dead, bySource };
  }));

  // ================= cashier and item sales report =================
  app.get('/api/reports/sales', wrap(req => {
    const from = req.query.from || today(), to = req.query.to || today();
    const range = [from, to + 'T23:59:59'];
    return {
      from, to,
      byCashier: all('SELECT by_user, method, SUM(amount) amount, COUNT(*) n FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY by_user, method ORDER BY by_user', ...range),
      byHour: all("SELECT substr(created_at,12,2) hour, SUM(amount) amount, COUNT(DISTINCT bill_id) n FROM payments WHERE amount>0 AND created_at BETWEEN ? AND ? GROUP BY hour ORDER BY hour", ...range),
      items: all("SELECT description, SUM(qty) qty, SUM(amount) amount FROM bill_lines WHERE kind='drug' AND amount>0 AND created_at BETWEEN ? AND ? GROUP BY description ORDER BY amount DESC LIMIT 60", ...range),
      refunds: all('SELECT r.*, b.receipt_no FROM refunds r JOIN bills b ON b.id=r.bill_id WHERE r.created_at BETWEEN ? AND ? ORDER BY r.id DESC', ...range),
      shifts: all('SELECT * FROM shifts WHERE opened_at BETWEEN ? AND ? ORDER BY id DESC', ...range).map(shiftSummary),
      receipts: get("SELECT COUNT(*) n FROM bills WHERE status='paid' AND closed_at BETWEEN ? AND ?", ...range).n,
    };
  }));
};
