// ────────────────────────────────────────────────
//  EXCEL BUILDER
//  NOTE: The original 4 sheets are UNCHANGED. The optional `resolution`
//        argument only ADDS a 5th "Resolution" sheet; when it is omitted the
//        output is byte-identical to before.
// ────────────────────────────────────────────────
import * as XLSX from 'xlsx';

<<<<<<< HEAD
export function buildXLSX(d, resolution, comments = {}){
=======
export function buildXLSX(d, resolution, comments = {}, orderStatus = '', orderComment = '', deliveryDate = ''){
>>>>>>> 87432db (New Dashboard)
  const wb=XLSX.utils.book_new();
  const inf=d.order_info||{},bil=d.billing_address||{},del=d.delivery_address||{},fin=d.financials||{};
  const items=d.line_items||[];
  const results=resolution?.results||[];

  // Calculate updated totals using the new logic
  const subTotal = Number(fin.sub_total) || 0;
  const transport = Number(fin.transportation_charges) || 0;
  const total = Number(fin.total) || 0;

  let totalAdjustment = 0;
  results.forEach((r) => {
    const lineIndex = Number(String(r.lineId).split('-').pop()) - 1;
    const item = (Number.isInteger(lineIndex) && lineIndex >= 0 && items[lineIndex]) || null;
    if (!item) return;

    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const itemTotal = qty * Math.abs(unitPrice);
    const comment = comments[r.lineId] || '';
    const isNotFound = comment === 'Not Found';
    const isManual = r.source === 'manual_addition';

    if (isNotFound) {
      totalAdjustment -= itemTotal;
    } else if (isManual) {
      if (unitPrice < 0) {
        totalAdjustment -= itemTotal;
      } else {
        totalAdjustment += itemTotal;
      }
    }
  });

  const updatedSub = subTotal + totalAdjustment;
  const updatedTot = total + totalAdjustment;

  // Discounts: an email can carry more than one discount line (e.g. a
  // frozen-range volume discount AND a separate sales-rep discount). Use the
  // parser's full `discounts` list so every line's own label is exported.
  // For orders saved before that list existed, only the LAST discount line
  // was ever kept — but `total` was still parsed correctly, so any gap
  // between subTotal - storedDiscount - transport and total is an earlier
  // discount's amount (its exact label is gone). Surface that gap as its own
  // row so the export adds up to `total` again.
  let discountRows;
  if (Array.isArray(fin.discounts) && fin.discounts.length) {
    discountRows = fin.discounts.filter((dsc) => Number(dsc.amount) !== 0);
  } else {
    const storedDiscount = Number(fin.discount) || 0;
    discountRows = storedDiscount ? [{ label: fin.discount_label || 'Discount', amount: storedDiscount }] : [];
    if (subTotal > 0 && total > 0) {
      const diff = Math.round((total - subTotal - transport) * 100) / 100;
      const remainder = Math.round((diff - storedDiscount) * 100) / 100;
      if (Math.abs(remainder) >= 0.01) {
        const label = storedDiscount !== 0 ? 'Other Discount' : (remainder < 0 ? 'Discount' : 'Other Charges');
        discountRows.push({ label, amount: remainder });
      }
    }
  }

  const add=(aoa,name,cols,merges)=>{
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=cols.map(w=>({wch:w}));
    if(merges)ws['!merges']=merges;
    XLSX.utils.book_append_sheet(wb,ws,name);
  };

  // Sheet 1 — Order Summary
<<<<<<< HEAD
=======
  // Order Status / Order Comment (V3.2, order-level — distinct from the
  // per-product Item Status / Reason / Comments): included only when a
  // caller actually has them (a saved order); the review-flow's pre-save
  // callers simply omit the args and these fall back to ''/''. No 'Unknown'
  // fallback (V3.3) — every real order carries an actual status value.
>>>>>>> 87432db (New Dashboard)
  add([
    ['ORDER SUMMARY'],[''],
    ['FIELD','VALUE'],
    ['Portal Order Ref No.',inf.order_ref||''],
    ['Customer ID',inf.customer_id||''],
    ['Order Date',inf.order_date||''],
<<<<<<< HEAD
=======
    ['Delivery Date',deliveryDate||inf.delivery_date||''],
>>>>>>> 87432db (New Dashboard)
    ['Representative',inf.representative||''],
    ['PO Number',inf.po_number||''],
    ['Payment Type',inf.payment_type||''],
    ['Additional Comments',inf.additional_comments||''],
<<<<<<< HEAD
=======
    ['Order Status',orderStatus||''],
    ['Order Comment',orderComment||''],
>>>>>>> 87432db (New Dashboard)
  ],'Order Summary',[30,50],[{s:{r:0,c:0},e:{r:0,c:1}}]);

  // Sheet 2 — Addresses
  const addrFields=[['company_name','Company Name'],['contact_name','Contact Name'],['address','Address'],['city','City'],['county','County'],['country','Country'],['post_code','Post Code'],['phone','Phone']];
  add([
    ['BILLING & DELIVERY ADDRESSES'],[''],
    ['FIELD','BILLING ADDRESS','','FIELD','DELIVERY ADDRESS'],
    ...addrFields.map(([k,label])=>[label,bil[k]||'','',label,del[k]||'']),
  ],'Addresses',[22,38,4,22,38],[{s:{r:0,c:0},e:{r:0,c:4}}]);

  // Sheet 3 — Order Items
  const itemRows=items.map((it,i)=>[i+1,it.product_code||'N.A',it.description||'',it.package||'',it.qty||0,it.unit_price||0,it.total||0]);
  add([
    [`ORDER LINE ITEMS — Ref: ${inf.order_ref||''} — Date: ${inf.order_date||''}`],[''],
    ['#','PRODUCT CODE','PRODUCT DESCRIPTION','PACKAGE','QTY','UNIT PRICE','LINE TOTAL'],
    ...itemRows,
    [''],
    ['','','','','','Sub Total',updatedSub],
    ...discountRows.map((dsc)=>['','','','','',dsc.label||'Discount',dsc.amount||0]),
    ['','','','','','Transport Charges',transport],
    ['','','','','','TOTAL',updatedTot],
  ],'Order Items',[5,14,54,16,6,15,15],[{s:{r:0,c:0},e:{r:0,c:6}}]);

  // Sheet 4 — Financial Summary
  add([
    ['FINANCIAL SUMMARY'],[''],
    ['DESCRIPTION','AMOUNT','NOTES'],
    ['Sub Total',updatedSub,'Sum of all line items'],
    ...discountRows.map((dsc)=>[dsc.label||'Discount',dsc.amount||0,'Applied discount']),
    ['Transport Charges',transport,'Delivery / shipping costs'],
    ['TOTAL PAYABLE',updatedTot,'Final amount due'],
    [''],
    ['PAYMENT DETAILS',''],
    ['Payment Type',inf.payment_type||''],
    ['PO Number',inf.po_number||''],
    ['Order Reference',inf.order_ref||''],
    ['Order Date',inf.order_date||''],
    ['Sales Representative',inf.representative||''],
  ],'Financial Summary',[32,22,30],[{s:{r:0,c:0},e:{r:0,c:2}}]);

  // Sheet 5 — Product Resolution (ADDITIVE; only when resolution data is passed)
  if(resolution&&Array.isArray(resolution.results)&&resolution.results.length){
    const resRows=resolution.results.map((r,i)=>{
      const approved=r.status==='approved';
      const sug=r.suggestedProduct||null;
      const website=approved?((r.match&&r.match.websiteProductName)||''):(sug?sug.websiteProductName:'');
      const itemNo=approved?((r.match&&r.match.itemNo)||''):(sug?sug.itemNo:'');
      const status=approved?'Previously Approved':'Needs Review';
      const score=approved?100:(sug&&sug.matchScore!=null?sug.matchScore:'');
      return [i+1,r.emailProductName||'',website,itemNo,status,score];
    });
    add([
      ['PRODUCT RESOLUTION'],[''],
      ['#','EMAIL PRODUCT','WEBSITE PRODUCT','ITEM NUMBER','RESOLUTION STATUS','MATCH SCORE'],
      ...resRows,
    ],'Resolution',[5,40,40,16,20,12],[{s:{r:0,c:0},e:{r:0,c:5}}]);
  }

  return wb;
}
