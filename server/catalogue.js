// Pentarch MediCore - master catalogue for Kenyan pharmacies, clinics and hospitals.
// Groups follow the Kenya Essential Medicines List 2023. Prices are indicative Nairobi retail (KES), editable per facility.
// Stock is held in base units (tablet, capsule, bottle, vial...). A pack holds `pack_size` base units.

const ITEMS = [];
// m(code, name, form, strength, unit, packSize, packName, packPrice, group, shop, opts)
function m(code, name, form, strength, unit, pack_size, pack_name, pack_price, group, shop, o = {}) {
  ITEMS.push({
    code, name, form, strength, unit, pack_size, pack_name, pack_price, group, shop,
    rx_only: o.rx ? 1 : 0, controlled: o.ctl ? 1 : 0,
    category: o.cat || 'drug',
    sell_loose: o.loose ?? (pack_size > 1 && ['tab', 'cap'].includes(unit)) ? 1 : 0,
    web: o.web ?? (!o.ctl && !['injection', 'infusion'].includes(form) && (o.cat || 'drug') !== 'reagent') ? 1 : 0,
    generic: o.generic || null,
    reorder_packs: o.reorder ?? 5,
    desc: o.desc || null,
  });
}
const RX = { rx: true };

// ---------- Pain, fever and inflammation ----------
const PAIN = ['Analgesics & anti-inflammatory', 'Pain & fever'];
m('PCM500', 'Paracetamol 500mg tablets', 'tablet', '500mg', 'tab', 100, 'box', 200, ...PAIN, { desc: 'For pain and fever. Adults: 1–2 tablets every 6 hours, max 8 a day.' });
m('PANAD', 'Panadol Advance 500mg tablets', 'tablet', '500mg', 'tab', 24, 'pack', 180, ...PAIN);
m('PANEX', 'Panadol Extra tablets (paracetamol + caffeine)', 'tablet', '500/65mg', 'tab', 24, 'pack', 260, ...PAIN);
m('HEDEX', 'Hedex tablets', 'tablet', '500/65mg', 'tab', 24, 'pack', 150, ...PAIN);
m('MARAMJ', 'Mara Moja tablets', 'tablet', '', 'tab', 20, 'pack', 130, ...PAIN);
m('PCMSYR', 'Paracetamol 120mg/5ml syrup 100ml', 'syrup', '120mg/5ml', 'bottle', 1, 'bottle', 120, ...PAIN, { desc: 'Children\'s fever and pain relief. Dose by age and weight.' });
m('CALPOL', 'Calpol infant suspension 100ml', 'syrup', '120mg/5ml', 'bottle', 1, 'bottle', 450, ...PAIN);
m('IBU400', 'Ibuprofen 400mg tablets', 'tablet', '400mg', 'tab', 100, 'box', 350, ...PAIN);
m('IBUSYR', 'Ibuprofen 100mg/5ml suspension 100ml', 'syrup', '100mg/5ml', 'bottle', 1, 'bottle', 180, ...PAIN);
m('DICLO50', 'Diclofenac sodium 50mg tablets', 'tablet', '50mg', 'tab', 100, 'box', 250, ...PAIN);
m('DICLGEL', 'Diclofenac gel 1% 30g', 'gel', '1%', 'tube', 1, 'tube', 250, ...PAIN);
m('MELOX15', 'Meloxicam 15mg tablets', 'tablet', '15mg', 'tab', 30, 'box', 300, ...PAIN, RX);
m('ASP75', 'Aspirin 75mg tablets (low dose)', 'tablet', '75mg', 'tab', 28, 'pack', 120, 'Cardiovascular', 'Chronic care', RX);
m('TRAM50', 'Tramadol 50mg capsules', 'capsule', '50mg', 'cap', 100, 'box', 900, ...PAIN, { rx: true, ctl: true });
m('DICLINJ', 'Diclofenac 75mg/3ml injection', 'injection', '75mg/3ml', 'amp', 10, 'box', 350, ...PAIN, RX);
m('PCMINJ', 'Paracetamol 1g/100ml infusion', 'infusion', '1g', 'bottle', 1, 'bottle', 450, ...PAIN, RX);
m('MORPH', 'Morphine 10mg/ml injection', 'injection', '10mg/ml', 'amp', 10, 'box', 1500, ...PAIN, { rx: true, ctl: true });
m('PETH', 'Pethidine 100mg/2ml injection', 'injection', '100mg/2ml', 'amp', 10, 'box', 1800, ...PAIN, { rx: true, ctl: true });

// ---------- Antibiotics ----------
const ABX = ['Antibiotics', 'Prescription medicines'];
m('AMX500', 'Amoxicillin 500mg capsules', 'capsule', '500mg', 'cap', 100, 'box', 650, ...ABX, RX);
m('AMX250', 'Amoxicillin 250mg capsules', 'capsule', '250mg', 'cap', 100, 'box', 400, ...ABX, RX);
m('AMXSYR', 'Amoxicillin 125mg/5ml suspension 100ml', 'syrup', '125mg/5ml', 'bottle', 1, 'bottle', 150, ...ABX, RX);
m('AMXDT', 'Amoxicillin 250mg dispersible tablets', 'tablet', '250mg', 'tab', 100, 'box', 450, ...ABX, RX);
m('AUG625', 'Amoxicillin/Clavulanate 625mg tablets', 'tablet', '625mg', 'tab', 14, 'pack', 900, ...ABX, RX);
m('AUG1G', 'Amoxicillin/Clavulanate 1g tablets', 'tablet', '1g', 'tab', 14, 'pack', 1300, ...ABX, RX);
m('AUGSYR', 'Amoxicillin/Clavulanate 228mg/5ml suspension 70ml', 'syrup', '228mg/5ml', 'bottle', 1, 'bottle', 750, ...ABX, RX);
m('FLUC500', 'Flucloxacillin 500mg capsules', 'capsule', '500mg', 'cap', 100, 'box', 1100, ...ABX, RX);
m('AMPICLX', 'Ampicillin/Cloxacillin 500mg capsules', 'capsule', '500mg', 'cap', 100, 'box', 800, ...ABX, RX);
m('CIP500', 'Ciprofloxacin 500mg tablets', 'tablet', '500mg', 'tab', 100, 'box', 700, ...ABX, RX);
m('LEVO500', 'Levofloxacin 500mg tablets', 'tablet', '500mg', 'tab', 10, 'pack', 450, ...ABX, RX);
m('AZI500', 'Azithromycin 500mg tablets', 'tablet', '500mg', 'tab', 3, 'pack', 300, ...ABX, RX);
m('AZISYR', 'Azithromycin 200mg/5ml suspension 15ml', 'syrup', '200mg/5ml', 'bottle', 1, 'bottle', 350, ...ABX, RX);
m('ERY500', 'Erythromycin 500mg tablets', 'tablet', '500mg', 'tab', 100, 'box', 1400, ...ABX, RX);
m('CEFX500', 'Cefuroxime 500mg tablets', 'tablet', '500mg', 'tab', 10, 'pack', 900, ...ABX, RX);
m('CEPH500', 'Cefalexin 500mg capsules', 'capsule', '500mg', 'cap', 100, 'box', 1200, ...ABX, RX);
m('CEFIX200', 'Cefixime 200mg tablets', 'tablet', '200mg', 'tab', 10, 'pack', 650, ...ABX, RX);
m('DOXY100', 'Doxycycline 100mg capsules', 'capsule', '100mg', 'cap', 100, 'box', 500, ...ABX, RX);
m('MTZ400', 'Metronidazole 400mg tablets', 'tablet', '400mg', 'tab', 100, 'box', 250, ...ABX, RX);
m('MTZSYR', 'Metronidazole 200mg/5ml suspension 100ml', 'syrup', '200mg/5ml', 'bottle', 1, 'bottle', 150, ...ABX, RX);
m('COTRI', 'Co-trimoxazole 960mg tablets', 'tablet', '960mg', 'tab', 100, 'box', 400, ...ABX, RX);
m('COTSYR', 'Co-trimoxazole 240mg/5ml suspension 100ml', 'syrup', '240mg/5ml', 'bottle', 1, 'bottle', 120, ...ABX, RX);
m('NITRO100', 'Nitrofurantoin 100mg tablets', 'tablet', '100mg', 'tab', 100, 'box', 700, ...ABX, RX);
m('GENTINJ', 'Gentamicin 80mg/2ml injection', 'injection', '80mg/2ml', 'amp', 10, 'box', 250, ...ABX, RX);
m('CEFTR1', 'Ceftriaxone 1g injection', 'injection', '1g', 'vial', 1, 'vial', 150, ...ABX, RX);
m('BENZP', 'Benzylpenicillin 5MU injection', 'injection', '5MU', 'vial', 1, 'vial', 100, ...ABX, RX);
m('AMPINJ', 'Ampicillin 500mg injection', 'injection', '500mg', 'vial', 1, 'vial', 60, ...ABX, RX);
m('METINJ', 'Metronidazole 500mg/100ml infusion', 'infusion', '500mg', 'bottle', 1, 'bottle', 150, ...ABX, RX);

// ---------- Antimalarials ----------
const MAL = ['Antimalarials', 'Malaria'];
m('AL2012', 'Artemether/Lumefantrine 20/120mg (24 tabs)', 'tablet', '20/120mg', 'pack', 1, 'pack', 350, ...MAL, RX);
m('AL2012P', 'Artemether/Lumefantrine 20/120mg dispersible (6 tabs)', 'tablet', '20/120mg', 'pack', 1, 'pack', 150, ...MAL, RX);
m('AL80480', 'Artemether/Lumefantrine 80/480mg (6 tabs)', 'tablet', '80/480mg', 'pack', 1, 'pack', 450, ...MAL, RX);
m('DUOCOT', 'Dihydroartemisinin/Piperaquine (9 tabs)', 'tablet', '40/320mg', 'pack', 1, 'pack', 600, ...MAL, RX);
m('ARTINJ', 'Artesunate 60mg injection', 'injection', '60mg', 'vial', 1, 'vial', 450, ...MAL, RX);
m('SP', 'Sulfadoxine/Pyrimethamine 500/25mg (3 tabs)', 'tablet', '500/25mg', 'pack', 1, 'pack', 60, ...MAL, { rx: true, desc: 'Used for IPTp in pregnancy from 13 weeks.' });
m('QUIN300', 'Quinine sulphate 300mg tablets', 'tablet', '300mg', 'tab', 100, 'box', 900, ...MAL, RX);

// ---------- Cardiovascular ----------
const CV = ['Cardiovascular', 'Chronic care'];
m('AML5', 'Amlodipine 5mg tablets', 'tablet', '5mg', 'tab', 30, 'pack', 150, ...CV, RX);
m('AML10', 'Amlodipine 10mg tablets', 'tablet', '10mg', 'tab', 30, 'pack', 200, ...CV, RX);
m('LOS50', 'Losartan 50mg tablets', 'tablet', '50mg', 'tab', 30, 'pack', 350, ...CV, RX);
m('LOSH', 'Losartan/Hydrochlorothiazide 50/12.5mg tablets', 'tablet', '50/12.5mg', 'tab', 30, 'pack', 500, ...CV, RX);
m('ENAL10', 'Enalapril 10mg tablets', 'tablet', '10mg', 'tab', 30, 'pack', 200, ...CV, RX);
m('LISI10', 'Lisinopril 10mg tablets', 'tablet', '10mg', 'tab', 30, 'pack', 250, ...CV, RX);
m('HCTZ25', 'Hydrochlorothiazide 25mg tablets', 'tablet', '25mg', 'tab', 100, 'box', 200, ...CV, RX);
m('NIF20', 'Nifedipine 20mg SR tablets', 'tablet', '20mg', 'tab', 30, 'pack', 180, ...CV, RX);
m('ATEN50', 'Atenolol 50mg tablets', 'tablet', '50mg', 'tab', 28, 'pack', 150, ...CV, RX);
m('CARV', 'Carvedilol 6.25mg tablets', 'tablet', '6.25mg', 'tab', 30, 'pack', 350, ...CV, RX);
m('METHYL', 'Methyldopa 250mg tablets', 'tablet', '250mg', 'tab', 100, 'box', 550, ...CV, { rx: true, desc: 'First-line antihypertensive in pregnancy.' });
m('FURO40', 'Furosemide 40mg tablets', 'tablet', '40mg', 'tab', 100, 'box', 200, ...CV, RX);
m('SPIRO25', 'Spironolactone 25mg tablets', 'tablet', '25mg', 'tab', 28, 'pack', 300, ...CV, RX);
m('ATOR20', 'Atorvastatin 20mg tablets', 'tablet', '20mg', 'tab', 30, 'pack', 400, ...CV, RX);
m('HYDRAL', 'Hydralazine 20mg injection', 'injection', '20mg', 'amp', 5, 'box', 1500, ...CV, RX);

// ---------- Diabetes and endocrine ----------
const DM = ['Diabetes & endocrine', 'Chronic care'];
m('MET500', 'Metformin 500mg tablets', 'tablet', '500mg', 'tab', 100, 'box', 300, ...DM, RX);
m('MET850', 'Metformin 850mg tablets', 'tablet', '850mg', 'tab', 100, 'box', 400, ...DM, RX);
m('GLIB5', 'Glibenclamide 5mg tablets', 'tablet', '5mg', 'tab', 100, 'box', 150, ...DM, RX);
m('GLIC80', 'Gliclazide 80mg tablets', 'tablet', '80mg', 'tab', 60, 'pack', 350, ...DM, RX);
m('GLIM2', 'Glimepiride 2mg tablets', 'tablet', '2mg', 'tab', 30, 'pack', 300, ...DM, RX);
m('INSMIX', 'Insulin 70/30 (Mixtard) 100IU/ml 10ml', 'injection', '100IU/ml', 'vial', 1, 'vial', 750, ...DM, RX);
m('INSSOL', 'Soluble insulin (Actrapid) 100IU/ml 10ml', 'injection', '100IU/ml', 'vial', 1, 'vial', 750, ...DM, RX);
m('LEVOT', 'Levothyroxine 50mcg tablets', 'tablet', '50mcg', 'tab', 100, 'box', 500, ...DM, RX);

// ---------- Gastrointestinal ----------
const GI = ['Gastrointestinal', 'Stomach & digestion'];
m('OMP20', 'Omeprazole 20mg capsules', 'capsule', '20mg', 'cap', 28, 'pack', 200, ...GI);
m('ESOM40', 'Esomeprazole 40mg tablets', 'tablet', '40mg', 'tab', 14, 'pack', 450, ...GI, RX);
m('PANTO40', 'Pantoprazole 40mg tablets', 'tablet', '40mg', 'tab', 14, 'pack', 400, ...GI, RX);
m('RAN150', 'Ranitidine 150mg tablets', 'tablet', '150mg', 'tab', 20, 'pack', 100, ...GI);
m('ANTAC', 'Magnesium trisilicate mixture 200ml', 'syrup', '200ml', 'bottle', 1, 'bottle', 120, ...GI);
m('GAVIS', 'Gaviscon liquid 150ml', 'syrup', '150ml', 'bottle', 1, 'bottle', 650, ...GI);
m('ENO', 'Eno fruit salt sachet', 'sachet', '5g', 'sachet', 6, 'strip', 120, ...GI);
m('ORS', 'ORS sachets (low osmolarity)', 'sachet', '20.5g', 'sachet', 1, 'sachet', 30, ...GI, { reorder: 50, desc: 'Mix one sachet in 1 litre of clean water. Give after every loose stool.' });
m('ZNC20', 'Zinc sulphate 20mg dispersible tablets', 'tablet', '20mg', 'tab', 10, 'strip', 80, ...GI, { desc: 'Give with ORS for 10–14 days in childhood diarrhoea.' });
m('LOPER', 'Loperamide 2mg capsules', 'capsule', '2mg', 'cap', 10, 'strip', 60, ...GI);
m('HYOS', 'Hyoscine butylbromide 10mg tablets (Buscopan)', 'tablet', '10mg', 'tab', 20, 'pack', 350, ...GI);
m('HYOSINJ', 'Hyoscine butylbromide 20mg/ml injection', 'injection', '20mg/ml', 'amp', 10, 'box', 450, ...GI, RX);
m('METOC', 'Metoclopramide 10mg tablets', 'tablet', '10mg', 'tab', 100, 'box', 250, ...GI, RX);
m('METOCINJ', 'Metoclopramide 10mg/2ml injection', 'injection', '10mg/2ml', 'amp', 10, 'box', 250, ...GI, RX);
m('ONDAN', 'Ondansetron 4mg tablets', 'tablet', '4mg', 'tab', 10, 'pack', 350, ...GI, RX);
m('BISAC', 'Bisacodyl 5mg tablets', 'tablet', '5mg', 'tab', 20, 'pack', 100, ...GI);
m('LACT', 'Lactulose syrup 100ml', 'syrup', '3.3g/5ml', 'bottle', 1, 'bottle', 450, ...GI);
m('ALB400', 'Albendazole 400mg tablet', 'tablet', '400mg', 'tab', 1, 'tab', 50, 'Anthelmintics', 'Stomach & digestion', { reorder: 30 });
m('ALBSYR', 'Albendazole 200mg/5ml suspension 10ml', 'syrup', '200mg/5ml', 'bottle', 1, 'bottle', 60, 'Anthelmintics', 'Stomach & digestion');
m('MEBEN', 'Mebendazole 100mg tablets (6s)', 'tablet', '100mg', 'pack', 1, 'pack', 60, 'Anthelmintics', 'Stomach & digestion');
m('PRAZ', 'Praziquantel 600mg tablets', 'tablet', '600mg', 'tab', 4, 'pack', 200, 'Anthelmintics', 'Stomach & digestion', RX);

// ---------- Respiratory, cough, cold, allergy ----------
const RESP = ['Respiratory', 'Cold, cough & flu'];
m('SALB', 'Salbutamol 100mcg inhaler', 'inhaler', '100mcg', 'inhaler', 1, 'inhaler', 450, ...RESP, RX);
m('SALBTAB', 'Salbutamol 4mg tablets', 'tablet', '4mg', 'tab', 100, 'box', 150, ...RESP, RX);
m('SALBSYR', 'Salbutamol 2mg/5ml syrup 100ml', 'syrup', '2mg/5ml', 'bottle', 1, 'bottle', 120, ...RESP, RX);
m('SALBNEB', 'Salbutamol nebules 2.5mg', 'solution', '2.5mg/2.5ml', 'nebule', 20, 'box', 600, ...RESP, RX);
m('BUDEC', 'Budesonide/Formoterol 160/4.5 inhaler', 'inhaler', '160/4.5mcg', 'inhaler', 1, 'inhaler', 2800, ...RESP, RX);
m('BECLO', 'Beclomethasone 100mcg inhaler', 'inhaler', '100mcg', 'inhaler', 1, 'inhaler', 900, ...RESP, RX);
m('MONTE', 'Montelukast 10mg tablets', 'tablet', '10mg', 'tab', 30, 'pack', 900, ...RESP, RX);
m('AMINO', 'Aminophylline 100mg tablets', 'tablet', '100mg', 'tab', 100, 'box', 200, ...RESP, RX);
m('COFSYR', 'Dry cough syrup (dextromethorphan) 100ml', 'syrup', '100ml', 'bottle', 1, 'bottle', 250, ...RESP);
m('EXPEC', 'Chesty cough expectorant (guaifenesin) 100ml', 'syrup', '100ml', 'bottle', 1, 'bottle', 280, ...RESP);
m('BENYL', 'Benylin 4 Flu syrup 100ml', 'syrup', '100ml', 'bottle', 1, 'bottle', 550, ...RESP);
m('KIDCOF', 'Children\'s cough syrup 100ml', 'syrup', '100ml', 'bottle', 1, 'bottle', 250, ...RESP);
m('COLDCAP', 'Cold & flu capsules (paracetamol, phenylephrine, chlorphenamine)', 'capsule', '', 'cap', 20, 'pack', 200, ...RESP);
m('STREP', 'Strepsils lozenges (24s)', 'lozenge', '', 'pack', 1, 'pack', 450, ...RESP);
m('VICKS', 'Vicks VapoRub 50g', 'ointment', '50g', 'jar', 1, 'jar', 450, ...RESP);
m('NASAL', 'Saline nasal drops 10ml', 'drops', '0.9%', 'bottle', 1, 'bottle', 150, ...RESP);
m('XYLO', 'Xylometazoline 0.1% nasal spray', 'spray', '0.1%', 'bottle', 1, 'bottle', 350, ...RESP);
const ALG = ['Antihistamines & allergy', 'Allergy'];
m('CTZ10', 'Cetirizine 10mg tablets', 'tablet', '10mg', 'tab', 100, 'box', 300, ...ALG);
m('LORA10', 'Loratadine 10mg tablets', 'tablet', '10mg', 'tab', 30, 'pack', 200, ...ALG);
m('CTZSYR', 'Cetirizine 5mg/5ml syrup 60ml', 'syrup', '5mg/5ml', 'bottle', 1, 'bottle', 180, ...ALG);
m('CPM4', 'Chlorphenamine 4mg tablets', 'tablet', '4mg', 'tab', 100, 'box', 100, ...ALG);
m('PROMSYR', 'Promethazine 5mg/5ml syrup 100ml', 'syrup', '5mg/5ml', 'bottle', 1, 'bottle', 120, ...ALG);
m('PRED5', 'Prednisolone 5mg tablets', 'tablet', '5mg', 'tab', 100, 'box', 200, 'Corticosteroids', 'Prescription medicines', RX);
m('DEXA4', 'Dexamethasone 4mg/ml injection', 'injection', '4mg/ml', 'amp', 10, 'box', 300, 'Corticosteroids', 'Prescription medicines', RX);
m('HYDCINJ', 'Hydrocortisone 100mg injection', 'injection', '100mg', 'vial', 1, 'vial', 150, 'Corticosteroids', 'Prescription medicines', RX);
m('ADREN', 'Adrenaline 1mg/ml injection', 'injection', '1mg/ml', 'amp', 10, 'box', 700, 'Emergency', 'Prescription medicines', RX);

// ---------- Antifungals, skin ----------
const SKIN = ['Dermatological', 'Skin care'];
m('FLU150', 'Fluconazole 150mg capsule', 'capsule', '150mg', 'cap', 1, 'cap', 80, 'Antifungals', 'Sexual & reproductive health', { reorder: 20 });
m('CLOTCR', 'Clotrimazole 1% cream 20g', 'cream', '1%', 'tube', 1, 'tube', 120, ...SKIN);
m('CLOTPES', 'Clotrimazole 500mg pessary', 'pessary', '500mg', 'pessary', 1, 'pack', 150, 'Antifungals', 'Sexual & reproductive health');
m('MICON', 'Miconazole 2% cream 15g', 'cream', '2%', 'tube', 1, 'tube', 150, ...SKIN);
m('NYSTSUS', 'Nystatin oral suspension 30ml', 'syrup', '100,000IU/ml', 'bottle', 1, 'bottle', 250, 'Antifungals', 'Mum & baby');
m('GRISEO', 'Griseofulvin 500mg tablets', 'tablet', '500mg', 'tab', 100, 'box', 1200, 'Antifungals', 'Skin care', RX);
m('HCCR', 'Hydrocortisone 1% cream 15g', 'cream', '1%', 'tube', 1, 'tube', 150, ...SKIN);
m('BETACR', 'Betamethasone 0.1% cream 15g', 'cream', '0.1%', 'tube', 1, 'tube', 200, ...SKIN, RX);
m('FUSID', 'Fusidic acid 2% cream 15g', 'cream', '2%', 'tube', 1, 'tube', 450, ...SKIN);
m('SILVSUL', 'Silver sulfadiazine 1% cream 50g', 'cream', '1%', 'jar', 1, 'jar', 400, ...SKIN);
m('CALAM', 'Calamine lotion 100ml', 'lotion', '100ml', 'bottle', 1, 'bottle', 150, ...SKIN);
m('BENZYL', 'Benzyl benzoate 25% lotion 100ml', 'lotion', '25%', 'bottle', 1, 'bottle', 180, ...SKIN);
m('WHITF', 'Whitfield\'s ointment 20g', 'ointment', '20g', 'tube', 1, 'tube', 100, ...SKIN);
m('GENTVIO', 'Gentian violet paint 25ml', 'solution', '0.5%', 'bottle', 1, 'bottle', 60, ...SKIN);
m('PETJEL', 'Petroleum jelly 100g', 'ointment', '100g', 'jar', 1, 'jar', 150, 'Personal care', 'Skin care');
m('SUNSCR', 'Sunscreen SPF 50 lotion 100ml', 'lotion', 'SPF50', 'bottle', 1, 'bottle', 1500, 'Personal care', 'Skin care');

// ---------- Eye and ear ----------
const EYE = ['Eye & ear', 'Eye & ear'];
m('CHLORE', 'Chloramphenicol 0.5% eye drops 10ml', 'drops', '0.5%', 'bottle', 1, 'bottle', 100, ...EYE, RX);
m('TETEYE', 'Tetracycline 1% eye ointment', 'ointment', '1%', 'tube', 1, 'tube', 60, ...EYE);
m('CIPEYE', 'Ciprofloxacin 0.3% eye/ear drops', 'drops', '0.3%', 'bottle', 1, 'bottle', 200, ...EYE, RX);
m('ARTEAR', 'Artificial tears eye drops 10ml', 'drops', '', 'bottle', 1, 'bottle', 450, ...EYE);
m('EARWAX', 'Ear wax drops 10ml', 'drops', '', 'bottle', 1, 'bottle', 250, ...EYE);

// ---------- Vitamins, minerals, supplements ----------
const VIT = ['Vitamins & minerals', 'Vitamins & supplements'];
m('FEFOL', 'Ferrous sulphate + Folic acid tablets', 'tablet', '200mg/0.4mg', 'tab', 100, 'box', 150, ...VIT, { desc: 'Iron and folic acid supplementation (IFAS) for pregnancy.' });
m('FOLIC', 'Folic acid 5mg tablets', 'tablet', '5mg', 'tab', 100, 'box', 100, ...VIT);
m('RANF', 'Haematinic capsules (Ranferon-type)', 'capsule', '', 'cap', 30, 'pack', 350, ...VIT);
m('HAEMSYR', 'Haematinic syrup 200ml', 'syrup', '200ml', 'bottle', 1, 'bottle', 450, ...VIT);
m('VITC', 'Vitamin C 500mg chewable tablets', 'tablet', '500mg', 'tab', 100, 'box', 350, ...VIT);
m('VITBCO', 'Vitamin B complex tablets', 'tablet', '', 'tab', 100, 'box', 150, ...VIT);
m('MULTI', 'Multivitamin tablets (30s)', 'tablet', '', 'tab', 30, 'pack', 650, ...VIT);
m('MULTSYR', 'Children\'s multivitamin syrup 100ml', 'syrup', '100ml', 'bottle', 1, 'bottle', 350, ...VIT);
m('CALCD', 'Calcium + Vitamin D3 tablets (30s)', 'tablet', '', 'tab', 30, 'pack', 650, ...VIT);
m('OMEGA', 'Omega-3 fish oil capsules (30s)', 'capsule', '1000mg', 'cap', 30, 'pack', 900, ...VIT);
m('VITA', 'Vitamin A 200,000IU capsules', 'capsule', '200,000IU', 'cap', 100, 'box', 800, ...VIT);
m('PREGVIT', 'Pregnancy multivitamin (Pregnacare-type, 30s)', 'tablet', '', 'tab', 30, 'pack', 1500, VIT[0], 'Mum & baby');
m('GLUCD', 'Glucose powder 100g', 'powder', '100g', 'tin', 1, 'tin', 120, 'Nutrition', 'Vitamins & supplements');

// ---------- Reproductive, maternal, family planning ----------
const RH = ['Reproductive health', 'Sexual & reproductive health'];
m('COC', 'Combined oral contraceptive (Microgynon-type) cycle', 'tablet', '', 'cycle', 1, 'cycle', 100, ...RH);
m('POP', 'Progestogen-only pill cycle', 'tablet', '', 'cycle', 1, 'cycle', 120, ...RH);
m('EC', 'Emergency contraceptive (levonorgestrel 1.5mg)', 'tablet', '1.5mg', 'tab', 1, 'pack', 150, ...RH);
m('DMPA', 'Medroxyprogesterone 150mg injection (Depo)', 'injection', '150mg/ml', 'vial', 1, 'vial', 150, ...RH, RX);
m('IMPL', 'Contraceptive implant (Jadelle-type)', 'device', '', 'pc', 1, 'pc', 1500, ...RH, { rx: true, cat: 'consumable' });
m('IUCD', 'Copper IUCD (T380A)', 'device', '', 'pc', 1, 'pc', 500, ...RH, { rx: true, cat: 'consumable' });
m('CONDOM', 'Male condoms (3s)', 'device', '', 'pack', 1, 'pack', 100, ...RH, { cat: 'consumable', web: true });
m('FCONDOM', 'Female condom', 'device', '', 'pc', 1, 'pc', 150, ...RH, { cat: 'consumable', web: true });
m('OXY10', 'Oxytocin 10 IU injection', 'injection', '10IU/ml', 'amp', 10, 'box', 600, 'Maternal health', 'Prescription medicines', RX);
m('MISO', 'Misoprostol 200mcg tablets', 'tablet', '200mcg', 'tab', 4, 'pack', 300, 'Maternal health', 'Prescription medicines', { rx: true, ctl: true });
m('MGSO4', 'Magnesium sulphate 50% injection 10ml', 'injection', '50%', 'amp', 10, 'box', 800, 'Maternal health', 'Prescription medicines', RX);
m('ERGO', 'Ergometrine 0.5mg injection', 'injection', '0.5mg/ml', 'amp', 10, 'box', 500, 'Maternal health', 'Prescription medicines', RX);
m('VITK', 'Vitamin K (phytomenadione) 1mg neonatal injection', 'injection', '1mg/0.5ml', 'amp', 10, 'box', 400, 'Maternal health', 'Prescription medicines', RX);
m('TEO', 'Tetracycline eye ointment (neonatal) 1%', 'ointment', '1%', 'tube', 1, 'tube', 60, 'Maternal health', 'Mum & baby');
m('CHX', 'Chlorhexidine 7.1% cord gel 10g', 'gel', '7.1%', 'tube', 1, 'tube', 100, 'Maternal health', 'Mum & baby');

// ---------- CNS, mental health ----------
const CNS = ['Central nervous system', 'Prescription medicines'];
m('DZP5', 'Diazepam 5mg tablets', 'tablet', '5mg', 'tab', 100, 'box', 300, ...CNS, { rx: true, ctl: true });
m('DZPINJ', 'Diazepam 10mg/2ml injection', 'injection', '10mg/2ml', 'amp', 10, 'box', 500, ...CNS, { rx: true, ctl: true });
m('PHENO', 'Phenobarbital 30mg tablets', 'tablet', '30mg', 'tab', 100, 'box', 300, ...CNS, { rx: true, ctl: true });
m('CARBA', 'Carbamazepine 200mg tablets', 'tablet', '200mg', 'tab', 100, 'box', 600, ...CNS, RX);
m('SODVAL', 'Sodium valproate 200mg tablets', 'tablet', '200mg', 'tab', 100, 'box', 900, ...CNS, RX);
m('AMITRP', 'Amitriptyline 25mg tablets', 'tablet', '25mg', 'tab', 100, 'box', 300, ...CNS, RX);
m('FLUOX', 'Fluoxetine 20mg capsules', 'capsule', '20mg', 'cap', 30, 'pack', 450, ...CNS, RX);
m('HALO', 'Haloperidol 5mg tablets', 'tablet', '5mg', 'tab', 100, 'box', 400, ...CNS, RX);
m('BETAHIS', 'Betahistine 16mg tablets', 'tablet', '16mg', 'tab', 30, 'pack', 600, ...CNS, RX);

// ---------- IV fluids ----------
const IV = ['IV fluids & electrolytes', 'Prescription medicines'];
m('NS500', 'Sodium chloride 0.9% 500ml', 'infusion', '0.9%', 'bag', 1, 'bag', 120, ...IV, RX);
m('RL500', 'Ringer\'s lactate 500ml', 'infusion', '500ml', 'bag', 1, 'bag', 130, ...IV, RX);
m('D5', 'Dextrose 5% 500ml', 'infusion', '5%', 'bag', 1, 'bag', 120, ...IV, RX);
m('D50', 'Dextrose 50% 50ml', 'injection', '50%', 'vial', 1, 'vial', 150, ...IV, RX);
m('WFI', 'Water for injection 10ml', 'injection', '10ml', 'amp', 50, 'box', 500, ...IV, RX);
m('LIDO2', 'Lidocaine 2% injection 20ml', 'injection', '2%', 'vial', 1, 'vial', 150, 'Anaesthetics', 'Prescription medicines', RX);
m('KETAM', 'Ketamine 500mg/10ml injection', 'injection', '50mg/ml', 'vial', 1, 'vial', 900, 'Anaesthetics', 'Prescription medicines', { rx: true, ctl: true });
m('TT', 'Tetanus toxoid vaccine (TT/Td) 0.5ml', 'injection', '0.5ml', 'dose', 10, 'vial', 1200, 'Vaccines', 'Prescription medicines', RX);
m('ARV', 'Anti-rabies vaccine', 'injection', '', 'vial', 1, 'vial', 1800, 'Vaccines', 'Prescription medicines', RX);

// ---------- Mum and baby / personal care / first aid (OTC retail) ----------
m('DIAPS', 'Baby diapers size 3 (40s)', 'device', 'Size 3', 'pack', 1, 'pack', 1200, 'Personal care', 'Mum & baby', { cat: 'consumable', web: true });
m('WIPES', 'Baby wipes (72s)', 'device', '', 'pack', 1, 'pack', 350, 'Personal care', 'Mum & baby', { cat: 'consumable', web: true });
m('GRIPE', 'Gripe water 150ml', 'syrup', '150ml', 'bottle', 1, 'bottle', 350, 'Personal care', 'Mum & baby');
m('PADS', 'Sanitary pads (10s)', 'device', '', 'pack', 1, 'pack', 150, 'Personal care', 'Personal care', { cat: 'consumable', web: true });
m('SANIT', 'Hand sanitizer 500ml', 'solution', '70% alcohol', 'bottle', 1, 'bottle', 450, 'Personal care', 'Personal care', { cat: 'consumable', web: true });
m('DETTOL', 'Antiseptic liquid 500ml (Dettol-type)', 'solution', '', 'bottle', 1, 'bottle', 550, 'Antiseptics', 'First aid', { cat: 'consumable', web: true });
m('POVID', 'Povidone-iodine 10% solution 500ml', 'solution', '10%', 'bottle', 1, 'bottle', 650, 'Antiseptics', 'First aid', { cat: 'consumable', web: true });
m('SPIRIT', 'Surgical spirit 500ml', 'solution', '', 'bottle', 1, 'bottle', 300, 'Antiseptics', 'First aid', { cat: 'consumable', web: true });
m('HYDPER', 'Hydrogen peroxide 6% 100ml', 'solution', '6%', 'bottle', 1, 'bottle', 120, 'Antiseptics', 'First aid', { cat: 'consumable', web: true });
m('PLAST', 'Adhesive plasters (100s)', 'device', '', 'box', 1, 'box', 250, 'Dressings', 'First aid', { cat: 'consumable', web: true });
m('ZINCOX', 'Zinc oxide adhesive tape 2.5cm x 5m', 'device', '2.5cm', 'roll', 1, 'roll', 150, 'Dressings', 'First aid', { cat: 'consumable', web: true });
m('CREPE', 'Crepe bandage 10cm', 'device', '10cm', 'roll', 1, 'roll', 150, 'Dressings', 'First aid', { cat: 'consumable', web: true });
m('GAUZE', 'Sterile gauze swabs 10x10cm (100s)', 'device', '10x10cm', 'swab', 100, 'pack', 600, 'Dressings', 'First aid', { cat: 'consumable', web: true, loose: true });
m('GAUZROL', 'Gauze roll 90cm x 100m', 'device', '', 'roll', 1, 'roll', 2500, 'Dressings', 'First aid', { cat: 'consumable', web: false });
m('COTTON', 'Cotton wool 500g', 'device', '500g', 'roll', 1, 'roll', 450, 'Dressings', 'First aid', { cat: 'consumable', web: true });
m('FAKIT', 'First aid kit (home)', 'kit', '', 'kit', 1, 'kit', 1800, 'Dressings', 'First aid', { cat: 'consumable', web: true });

// ---------- Medical devices (retail) ----------
const DEV = ['Medical devices', 'Medical devices'];
m('THERM', 'Digital thermometer', 'device', '', 'pc', 1, 'pc', 450, ...DEV, { cat: 'consumable', web: true });
m('BPMON', 'Digital blood pressure monitor (upper arm)', 'device', '', 'pc', 1, 'pc', 4500, ...DEV, { cat: 'consumable', web: true });
m('GLUCM', 'Glucometer kit', 'device', '', 'pc', 1, 'pc', 2500, ...DEV, { cat: 'consumable', web: true });
m('GLUSTR', 'Glucometer test strips (50s)', 'device', '', 'strip', 50, 'box', 1800, ...DEV, { cat: 'consumable', web: true });
m('LANCET', 'Lancets (100s)', 'device', '', 'pc', 100, 'box', 500, ...DEV, { cat: 'consumable', web: true, loose: true });
m('PULSOX', 'Fingertip pulse oximeter', 'device', '', 'pc', 1, 'pc', 2500, ...DEV, { cat: 'consumable', web: true });
m('NEBUL', 'Nebuliser machine', 'device', '', 'pc', 1, 'pc', 5500, ...DEV, { cat: 'consumable', web: true });
m('SPACER', 'Inhaler spacer', 'device', '', 'pc', 1, 'pc', 900, ...DEV, { cat: 'consumable', web: true });
m('PREGKIT', 'Home pregnancy test kit', 'kit', '', 'pc', 1, 'pc', 100, 'Diagnostics', 'Sexual & reproductive health', { cat: 'consumable', web: true });
m('MASK3', 'Face masks 3-ply (50s)', 'device', '', 'pc', 50, 'box', 400, 'PPE', 'Personal care', { cat: 'consumable', web: true, loose: true });

// ---------- Clinical consumables (not sold online) ----------
const CON = { cat: 'consumable', web: false };
m('GLOVE', 'Examination gloves, latex, medium (100s)', 'gloves', 'M', 'pair', 50, 'box', 900, 'PPE', 'Clinical supplies', { ...CON, loose: true });
m('GLOVSL', 'Examination gloves, nitrile, large (100s)', 'gloves', 'L', 'pair', 50, 'box', 1100, 'PPE', 'Clinical supplies', { ...CON, loose: true });
m('SGLOVE', 'Sterile surgical gloves size 7.5', 'gloves', '7.5', 'pair', 50, 'box', 2500, 'PPE', 'Clinical supplies', { ...CON, loose: true });
m('APRON', 'Disposable plastic aprons (100s)', 'device', '', 'pc', 100, 'pack', 800, 'PPE', 'Clinical supplies', { ...CON, loose: true });
m('SYR2', 'Syringe 2ml with needle (100s)', 'syringe', '2ml', 'pc', 100, 'box', 700, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('SYR5', 'Syringe 5ml with needle (100s)', 'syringe', '5ml', 'pc', 100, 'box', 800, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('SYR10', 'Syringe 10ml with needle (100s)', 'syringe', '10ml', 'pc', 100, 'box', 1100, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('INSYR', 'Insulin syringe 1ml (100s)', 'syringe', '1ml', 'pc', 100, 'box', 1200, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true, web: true });
m('NEED21', 'Hypodermic needle 21G (100s)', 'syringe', '21G', 'pc', 100, 'box', 400, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('CANN18', 'IV cannula 18G', 'device', '18G', 'pc', 50, 'box', 2500, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('CANN20', 'IV cannula 20G', 'device', '20G', 'pc', 50, 'box', 2500, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('CANN24', 'IV cannula 24G (paediatric)', 'device', '24G', 'pc', 50, 'box', 3000, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('GIVSET', 'IV giving set', 'device', '', 'pc', 1, 'pc', 60, 'Injection supplies', 'Clinical supplies', CON);
m('SCALP', 'Scalp vein set 23G', 'device', '23G', 'pc', 100, 'box', 1500, 'Injection supplies', 'Clinical supplies', { ...CON, loose: true });
m('SHARPS', 'Sharps container 5L', 'device', '5L', 'pc', 1, 'pc', 250, 'Infection control', 'Clinical supplies', CON);
m('CATH16', 'Foley catheter 16Fr', 'device', '16Fr', 'pc', 10, 'box', 800, 'Catheters & tubes', 'Clinical supplies', { ...CON, loose: true });
m('URBAG', 'Urine bag 2L', 'device', '2L', 'pc', 10, 'pack', 500, 'Catheters & tubes', 'Clinical supplies', { ...CON, loose: true });
m('NGT', 'Nasogastric tube 16Fr', 'device', '16Fr', 'pc', 10, 'pack', 500, 'Catheters & tubes', 'Clinical supplies', { ...CON, loose: true });
m('SUT30', 'Absorbable suture (chromic) 3/0', 'device', '3/0', 'pc', 12, 'box', 3000, 'Surgical', 'Clinical supplies', { ...CON, loose: true });
m('SUT20', 'Non-absorbable suture (nylon) 2/0', 'device', '2/0', 'pc', 12, 'box', 2500, 'Surgical', 'Clinical supplies', { ...CON, loose: true });
m('BLADE', 'Surgical blades No. 22 (100s)', 'device', '22', 'pc', 100, 'box', 1200, 'Surgical', 'Clinical supplies', { ...CON, loose: true });
m('CORDCL', 'Umbilical cord clamps (100s)', 'device', '', 'pc', 100, 'box', 1500, 'Maternity supplies', 'Clinical supplies', { ...CON, loose: true });
m('DELKIT', 'Delivery pack (sterile)', 'kit', '', 'kit', 1, 'kit', 1200, 'Maternity supplies', 'Clinical supplies', CON);
m('CIRCKIT', 'Male circumcision kit (disposable)', 'kit', '', 'kit', 1, 'kit', 1500, 'Surgical', 'Clinical supplies', CON);
m('MACKINT', 'Mackintosh sheet (per metre)', 'device', '', 'm', 1, 'm', 300, 'Maternity supplies', 'Clinical supplies', CON);
m('SPECUL', 'Vaginal speculum (disposable)', 'device', '', 'pc', 10, 'pack', 1000, 'Surgical', 'Clinical supplies', { ...CON, loose: true });
m('TONGUE', 'Tongue depressors (100s)', 'device', '', 'pc', 100, 'box', 400, 'Examination', 'Clinical supplies', { ...CON, loose: true });
m('ECGGEL', 'Ultrasound / ECG gel 250ml', 'gel', '250ml', 'bottle', 1, 'bottle', 350, 'Examination', 'Clinical supplies', CON);
m('OXYCAN', 'Nasal oxygen cannula (adult)', 'device', '', 'pc', 1, 'pc', 150, 'Respiratory supplies', 'Clinical supplies', CON);
m('NEBMASK', 'Nebuliser mask kit', 'device', '', 'pc', 1, 'pc', 300, 'Respiratory supplies', 'Clinical supplies', CON);
m('BLEACH', 'Sodium hypochlorite 3.5% 5L', 'solution', '3.5%', 'can', 1, 'can', 900, 'Infection control', 'Clinical supplies', CON);
m('CHLHEX', 'Chlorhexidine 4% surgical scrub 500ml', 'solution', '4%', 'bottle', 1, 'bottle', 800, 'Infection control', 'Clinical supplies', CON);

// ---------- Laboratory reagents and supplies ----------
const LAB = { cat: 'reagent', web: false };
m('MRDT', 'Malaria RDT kits (25 tests)', 'kit', '', 'test', 25, 'box', 2000, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('HCGST', 'Pregnancy test strips (50s)', 'kit', '', 'test', 50, 'box', 1500, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('URSTRIP', 'Urinalysis strips 10-parameter (100s)', 'kit', '', 'test', 100, 'bottle', 2500, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('HIVKIT', 'HIV rapid test kits (100 tests)', 'kit', '', 'test', 100, 'box', 8000, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('SYPHKIT', 'Syphilis rapid test kits (25 tests)', 'kit', '', 'test', 25, 'box', 2500, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('HBSKIT', 'HBsAg rapid test kits (25 tests)', 'kit', '', 'test', 25, 'box', 2500, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('HPYKIT', 'H. pylori antigen kits (25 tests)', 'kit', '', 'test', 25, 'box', 5000, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('WIDALR', 'Widal reagent set', 'kit', '', 'set', 1, 'set', 4500, 'Lab reagents', 'Lab supplies', LAB);
m('BGRPR', 'Blood grouping antisera (A, B, D)', 'kit', '', 'set', 1, 'set', 3500, 'Lab reagents', 'Lab supplies', LAB);
m('GIEMSA', 'Giemsa stain 500ml', 'solution', '500ml', 'bottle', 1, 'bottle', 2500, 'Lab reagents', 'Lab supplies', LAB);
m('SLIDES', 'Microscope slides (72s)', 'device', '', 'pc', 72, 'box', 350, 'Lab supplies', 'Lab supplies', { ...LAB, loose: true });
m('EDTA', 'EDTA vacutainer tubes (100s)', 'device', '', 'pc', 100, 'box', 1800, 'Lab supplies', 'Lab supplies', { ...LAB, loose: true });
m('PLAIN', 'Plain/serum vacutainer tubes (100s)', 'device', '', 'pc', 100, 'box', 1800, 'Lab supplies', 'Lab supplies', { ...LAB, loose: true });
m('URCONT', 'Urine containers (100s)', 'device', '', 'pc', 100, 'pack', 1200, 'Lab supplies', 'Lab supplies', { ...LAB, loose: true });
m('STOOLC', 'Stool containers (100s)', 'device', '', 'pc', 100, 'pack', 1200, 'Lab supplies', 'Lab supplies', { ...LAB, loose: true });
m('GLUCREA', 'Glucose analyser strips (50s)', 'kit', '', 'test', 50, 'box', 1800, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });
m('HBCUV', 'Haemoglobin meter cuvettes (50s)', 'kit', '', 'test', 50, 'box', 4500, 'Lab reagents', 'Lab supplies', { ...LAB, loose: true });

// Unit price for loose sales: pack price / pack size, plus ~20% loose premium, rounded up to whole shillings
for (const it of ITEMS) {
  it.price = it.pack_size > 1 ? Math.max(1, Math.ceil(it.pack_price / it.pack_size * 1.2)) : it.pack_price;
  it.cost = Math.round(it.pack_price * 0.68 / it.pack_size * 100) / 100; // cost per base unit
  it.reorder_level = it.reorder_packs * it.pack_size;
}

// ---------- Laboratory menu (by department) ----------
// [code, name, dept, unit, kind, refLow, refHigh, critLow, critHigh, abnormalText, price, sample, outsourcedOnly, tat, refLowF, refHighF, options]
const LAB_TESTS = [
  // Haematology
  ['FBC', 'Full blood count (FBC)', 'Haematology', '', 'text', null, null, null, null, null, 700, 'Blood (EDTA)', 0, '1 hr'],
  ['HB', 'Haemoglobin (Hb)', 'Haematology', 'g/dL', 'numeric', 13, 17, 7, 20, null, 250, 'Blood (EDTA)', 0, '15 min', 12, 15.5],
  ['ESR', 'Erythrocyte sedimentation rate (ESR)', 'Haematology', 'mm/hr', 'numeric', 0, 20, null, null, null, 300, 'Blood (EDTA)', 0, '1 hr'],
  ['PLT', 'Platelet count', 'Haematology', '×10⁹/L', 'numeric', 150, 400, 50, 1000, null, 400, 'Blood (EDTA)', 0, '1 hr'],
  ['WBC', 'White cell count (WBC)', 'Haematology', '×10⁹/L', 'numeric', 4, 11, 2, 30, null, 300, 'Blood (EDTA)', 0, '1 hr'],
  ['BGRP', 'Blood group and Rhesus', 'Haematology', '', 'text', null, null, null, null, null, 300, 'Blood (EDTA)', 0, '30 min'],
  ['SICK', 'Sickling test', 'Haematology', '', 'text', null, null, null, null, 'Positive', 400, 'Blood (EDTA)', 0, '1 hr'],
  ['PBF', 'Peripheral blood film', 'Haematology', '', 'text', null, null, null, null, null, 600, 'Blood (EDTA)', 0, '2 hr'],
  ['XMATCH', 'Cross-match (per unit)', 'Haematology', '', 'text', null, null, null, null, 'Incompatible', 800, 'Blood (plain + EDTA)', 0, '1 hr'],
  ['PTINR', 'Prothrombin time / INR', 'Haematology', 'INR', 'numeric', 0.8, 1.2, null, 5, null, 1200, 'Blood (citrate)', 1, '24 hr'],
  // Parasitology
  ['MPS', 'Malaria parasites (blood slide)', 'Parasitology', '', 'text', null, null, null, null, 'Positive', 300, 'Blood (EDTA)', 0, '30 min'],
  ['MRDT', 'Malaria RDT', 'Parasitology', '', 'text', null, null, null, null, 'Positive', 250, 'Finger prick', 0, '20 min'],
  ['STOOL', 'Stool for ova and cysts', 'Parasitology', '', 'text', null, null, null, null, null, 300, 'Stool', 0, '1 hr'],
  ['STOOLOB', 'Stool occult blood', 'Parasitology', '', 'text', null, null, null, null, 'Positive', 500, 'Stool', 0, '1 hr'],
  ['BRUC', 'Brucella antigen test', 'Serology', '', 'text', null, null, null, null, 'Positive', 600, 'Blood (plain)', 0, '1 hr'],
  // Clinical chemistry
  ['RBS', 'Random blood sugar', 'Clinical chemistry', 'mmol/L', 'numeric', 3.9, 7.8, 2.8, 20, null, 200, 'Finger prick', 0, '10 min'],
  ['FBS', 'Fasting blood sugar', 'Clinical chemistry', 'mmol/L', 'numeric', 3.9, 5.6, 2.8, 20, null, 200, 'Finger prick (fasting)', 0, '10 min'],
  ['OGTT', 'Oral glucose tolerance test (2 hr)', 'Clinical chemistry', 'mmol/L', 'numeric', 3.9, 7.8, null, null, null, 800, 'Blood (fluoride)', 0, '2.5 hr'],
  ['HBA1C', 'HbA1c', 'Clinical chemistry', '%', 'numeric', 4.0, 5.6, null, 14, null, 1800, 'Blood (EDTA)', 1, '24 hr'],
  ['CREAT', 'Serum creatinine', 'Clinical chemistry', 'µmol/L', 'numeric', 62, 115, null, 400, null, 600, 'Blood (plain)', 0, '2 hr', 53, 97],
  ['UREA', 'Blood urea', 'Clinical chemistry', 'mmol/L', 'numeric', 2.5, 7.8, null, 30, null, 500, 'Blood (plain)', 0, '2 hr'],
  ['UEC', 'Urea, electrolytes and creatinine (UEC)', 'Clinical chemistry', '', 'text', null, null, null, null, null, 1500, 'Blood (plain)', 0, '2 hr'],
  ['NA', 'Sodium', 'Clinical chemistry', 'mmol/L', 'numeric', 135, 145, 120, 160, null, 500, 'Blood (plain)', 0, '2 hr'],
  ['K', 'Potassium', 'Clinical chemistry', 'mmol/L', 'numeric', 3.5, 5.1, 2.5, 6.5, null, 500, 'Blood (plain)', 0, '2 hr'],
  ['LFT', 'Liver function tests (LFT)', 'Clinical chemistry', '', 'text', null, null, null, null, null, 2000, 'Blood (plain)', 0, '2 hr'],
  ['ALT', 'ALT (SGPT)', 'Clinical chemistry', 'U/L', 'numeric', 7, 56, null, 1000, null, 500, 'Blood (plain)', 0, '2 hr'],
  ['TBIL', 'Total bilirubin', 'Clinical chemistry', 'µmol/L', 'numeric', 3, 21, null, 340, null, 500, 'Blood (plain)', 0, '2 hr'],
  ['LIPID', 'Lipid profile', 'Clinical chemistry', '', 'text', null, null, null, null, null, 2500, 'Blood (plain, fasting)', 1, '24 hr'],
  ['CHOL', 'Total cholesterol', 'Clinical chemistry', 'mmol/L', 'numeric', 0, 5.2, null, null, null, 800, 'Blood (plain)', 0, '2 hr'],
  ['URIC', 'Uric acid', 'Clinical chemistry', 'µmol/L', 'numeric', 200, 430, null, null, null, 700, 'Blood (plain)', 0, '2 hr', 140, 360],
  ['AMYL', 'Serum amylase', 'Clinical chemistry', 'U/L', 'numeric', 30, 110, null, 500, null, 1200, 'Blood (plain)', 1, '24 hr'],
  ['CRP', 'C-reactive protein (CRP)', 'Clinical chemistry', 'mg/L', 'numeric', 0, 5, null, null, null, 900, 'Blood (plain)', 0, '1 hr'],
  ['PSA', 'Prostate-specific antigen (PSA)', 'Clinical chemistry', 'ng/mL', 'numeric', 0, 4, null, null, null, 1800, 'Blood (plain)', 1, '24 hr'],
  // Hormones
  ['TSH', 'Thyroid stimulating hormone (TSH)', 'Hormones', 'mIU/L', 'numeric', 0.4, 4.0, null, null, null, 2000, 'Blood (plain)', 1, '24 hr'],
  ['TFT', 'Thyroid function tests (TSH, T3, T4)', 'Hormones', '', 'text', null, null, null, null, null, 4500, 'Blood (plain)', 1, '24 hr'],
  ['BHCG', 'Serum beta-hCG (quantitative)', 'Hormones', 'mIU/mL', 'numeric', 0, 5, null, null, null, 2000, 'Blood (plain)', 1, '24 hr'],
  // Serology
  ['HIV', 'HIV test (rapid)', 'Serology', '', 'text', null, null, null, null, 'Reactive', 0, 'Finger prick', 0, '20 min'],
  ['VDRL', 'VDRL / RPR (syphilis)', 'Serology', '', 'text', null, null, null, null, 'Reactive', 300, 'Blood (plain)', 0, '30 min'],
  ['HBSAG', 'Hepatitis B surface antigen (HBsAg)', 'Serology', '', 'text', null, null, null, null, 'Positive', 600, 'Blood (plain)', 0, '30 min'],
  ['HCV', 'Hepatitis C antibody', 'Serology', '', 'text', null, null, null, null, 'Positive', 800, 'Blood (plain)', 0, '30 min'],
  ['WIDAL', 'Widal test', 'Serology', '', 'text', null, null, null, null, 'Positive', 400, 'Blood (plain)', 0, '1 hr'],
  ['TYPHI', 'Salmonella typhi antigen (stool)', 'Serology', '', 'text', null, null, null, null, 'Positive', 800, 'Stool', 0, '1 hr'],
  ['HPY', 'H. pylori stool antigen', 'Serology', '', 'text', null, null, null, null, 'Positive', 800, 'Stool', 0, '30 min'],
  ['HPYS', 'H. pylori serum antibody', 'Serology', '', 'text', null, null, null, null, 'Positive', 700, 'Blood (plain)', 0, '30 min'],
  ['RF', 'Rheumatoid factor', 'Serology', '', 'text', null, null, null, null, 'Positive', 800, 'Blood (plain)', 0, '1 hr'],
  ['COVID', 'COVID-19 antigen rapid test', 'Serology', '', 'text', null, null, null, null, 'Positive', 1000, 'Nasal swab', 0, '20 min'],
  // Urinalysis & reproductive
  ['URI', 'Urinalysis (dipstick + microscopy)', 'Urinalysis', '', 'text', null, null, null, null, null, 300, 'Urine', 0, '30 min'],
  ['HCG', 'Pregnancy test (urine hCG)', 'Urinalysis', '', 'text', null, null, null, null, null, 200, 'Urine', 0, '10 min'],
  ['UPROT', 'Urine protein (dipstick)', 'Urinalysis', '', 'text', null, null, null, null, null, 200, 'Urine', 0, '10 min'],
  ['HVS', 'High vaginal swab (wet prep + Gram)', 'Microbiology', '', 'text', null, null, null, null, null, 600, 'Swab', 0, '1 hr'],
  ['SEMEN', 'Semen analysis', 'Microbiology', '', 'text', null, null, null, null, null, 1500, 'Semen', 1, '24 hr'],
  // Microbiology
  ['URCS', 'Urine culture and sensitivity', 'Microbiology', '', 'text', null, null, null, null, null, 1500, 'Urine (sterile)', 1, '72 hr'],
  ['BLCS', 'Blood culture and sensitivity', 'Microbiology', '', 'text', null, null, null, null, null, 3000, 'Blood culture bottle', 1, '5 days'],
  ['PUSCS', 'Pus swab culture and sensitivity', 'Microbiology', '', 'text', null, null, null, null, null, 1500, 'Swab', 1, '72 hr'],
  ['GENEX', 'TB GeneXpert (sputum)', 'Microbiology', '', 'text', null, null, null, null, 'MTB detected', 0, 'Sputum', 1, '48 hr'],
  ['AFB', 'Sputum for AFB (ZN stain)', 'Microbiology', '', 'text', null, null, null, null, 'Positive', 300, 'Sputum', 0, '2 hr'],
  ['GRAM', 'Gram stain', 'Microbiology', '', 'text', null, null, null, null, null, 400, 'Swab / fluid', 0, '1 hr'],
  ['CSF', 'CSF analysis', 'Microbiology', '', 'text', null, null, null, null, null, 2500, 'CSF', 1, '24 hr'],
  // Cytology / histology
  ['PAP', 'Pap smear', 'Histology & cytology', '', 'text', null, null, null, null, null, 2000, 'Cervical smear', 1, '5 days'],
  ['VIA', 'VIA/VILI cervical screening', 'Histology & cytology', '', 'text', null, null, null, null, 'Positive', 500, 'Visual', 0, '15 min'],
  ['HISTO', 'Histology (tissue biopsy)', 'Histology & cytology', '', 'text', null, null, null, null, null, 6000, 'Tissue in formalin', 1, '7 days'],
];

// Quick-order bundles
const LAB_PANELS = [
  ['Fever work-up', ['MPS', 'FBC', 'WIDAL', 'URI']],
  ['Antenatal profile', ['HB', 'BGRP', 'VDRL', 'HIV', 'HBSAG', 'URI']],
  ['Diabetes review', ['RBS', 'HBA1C', 'CREAT', 'URI']],
  ['Hypertension review', ['CREAT', 'UEC', 'CHOL', 'URI']],
  ['Pre-operative', ['FBC', 'BGRP', 'UEC', 'HIV', 'HBSAG']],
  ['Abdominal pain', ['FBC', 'HPY', 'STOOL', 'URI', 'HCG']],
];

const IMAGING = [
  ['Obstetric ultrasound', 'Ultrasound', 2000], ['Pelvic ultrasound', 'Ultrasound', 2500], ['Abdominal ultrasound', 'Ultrasound', 3000],
  ['Abdomino-pelvic ultrasound', 'Ultrasound', 3500], ['Breast ultrasound', 'Ultrasound', 3000], ['Thyroid / neck ultrasound', 'Ultrasound', 3000],
  ['Scrotal ultrasound', 'Ultrasound', 3000], ['Doppler ultrasound (one limb)', 'Ultrasound', 5000],
  ['Chest X-ray', 'X-ray', 1500], ['Limb X-ray (per view)', 'X-ray', 1500], ['Spine X-ray (lumbar)', 'X-ray', 2500],
  ['Pelvis X-ray', 'X-ray', 2000], ['Skull X-ray', 'X-ray', 2000], ['Dental X-ray', 'X-ray', 1000],
  ['ECG (12-lead)', 'Cardiology', 1500], ['Echocardiogram', 'Cardiology', 6000],
  ['CT scan head', 'CT / MRI', 9000], ['CT scan abdomen', 'CT / MRI', 15000], ['MRI brain', 'CT / MRI', 25000], ['MRI spine', 'CT / MRI', 25000],
];

// [code, name, category, price, needs]
const SERVICES = [
  ['CONS', 'Outpatient consultation', 'consultation', 500],
  ['FUCONS', 'Follow-up consultation (within 2 weeks)', 'consultation', 300],
  ['SPCONS', 'Specialist consultation', 'consultation', 2000, 'hospital'],
  ['PCONS', 'Pharmacist consultation', 'consultation', 0],
  ['BPCHK', 'Blood pressure check', 'consultation', 100],
  ['BMI', 'Weight and BMI check', 'consultation', 100],
  ['ANC', 'Antenatal clinic visit', 'consultation', 300, 'maternity'],
  ['PNC', 'Postnatal clinic visit', 'consultation', 300, 'maternity'],
  ['CWC', 'Child welfare clinic visit', 'consultation', 200, 'maternity'],
  ['FPCONS', 'Family planning counselling', 'consultation', 200],
  ['FPINJ', 'Family planning injection administration', 'procedure', 150],
  ['IMPINS', 'Implant insertion', 'procedure', 1000],
  ['IMPREM', 'Implant removal', 'procedure', 1000],
  ['IUCDINS', 'IUCD insertion', 'procedure', 1000],
  ['CIRC', 'Male circumcision (minor surgery)', 'procedure', 3000],
  ['DRESS', 'Wound dressing', 'procedure', 300],
  ['SUTURE', 'Wound suturing', 'procedure', 1000],
  ['STOREM', 'Suture removal', 'procedure', 300],
  ['ID', 'Incision and drainage', 'procedure', 1500],
  ['INJ', 'Injection administration', 'procedure', 100],
  ['IVLINE', 'IV line insertion', 'procedure', 300],
  ['NEB', 'Nebulisation', 'procedure', 500],
  ['CATHINS', 'Urinary catheterisation', 'procedure', 800],
  ['EARSYR', 'Ear syringing', 'procedure', 800],
  ['FBREM', 'Foreign body removal', 'procedure', 1500],
  ['POP', 'Plaster of Paris application', 'procedure', 3000, 'admissions'],
  ['NVD', 'Normal vaginal delivery', 'procedure', 8000, 'maternity'],
  ['EPIS', 'Episiotomy repair', 'procedure', 2000, 'maternity'],
  ['MVA', 'Manual vacuum aspiration (MVA)', 'procedure', 5000, 'maternity'],
  ['CS', 'Caesarean section', 'procedure', 45000, 'theatre'],
  ['THEATRE', 'Theatre fee (minor)', 'procedure', 10000, 'theatre'],
  ['ADMFEE', 'Admission fee', 'bed', 1000, 'admissions'],
  ['NURSE', 'Nursing care (per day)', 'bed', 500, 'admissions'],
  ['DOCROUND', 'Doctor\'s ward round (per day)', 'bed', 1000, 'admissions'],
  ['OXYGEN', 'Oxygen therapy (per day)', 'bed', 2000, 'admissions'],
  ['MEDREP', 'Medical report / P3 form', 'other', 1500],
  ['SICKSHEET', 'Sick sheet', 'other', 300],
  ['AMBUL', 'Ambulance (within town)', 'other', 3000, 'admissions'],
];

module.exports = { ITEMS, LAB_TESTS, LAB_PANELS, IMAGING, SERVICES };
