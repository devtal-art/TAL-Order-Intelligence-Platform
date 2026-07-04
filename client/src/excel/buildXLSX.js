// ────────────────────────────────────────────────
//  EXCEL BUILDER
//  NOTE: The original 4 sheets are UNCHANGED. The optional `resolution`
//        argument only ADDS a 5th "Resolution" sheet; when it is omitted the
//        output is byte-identical to before.
// ────────────────────────────────────────────────
import * as XLSX from 'xlsx';

export function buildXLSX(d, resolution){
  const wb=XLSX.utils.book_new();
  const inf=d.order_info||{},bil=d.billing_address||{},del=d.delivery_address||{},fin=d.financials||{};
  const items=d.line_items||[];

  const add=(aoa,name,cols,merges)=>{
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=cols.map(w=>({wch:w}));
    if(merges)ws['!merges']=merges;
    XLSX.utils.book_append_sheet(wb,ws,name);
  };

  // Sheet 1 — Order Summary
  add([
    ['ORDER SUMMARY'],[''],
    ['FIELD','VALUE'],
    ['Portal Order Ref No.',inf.order_ref||''],
    ['Customer ID',inf.customer_id||''],
    ['Order Date',inf.order_date||''],
    ['Representative',inf.representative||''],
    ['PO Number',inf.po_number||''],
    ['Payment Type',inf.payment_type||''],
    ['Additional Comments',inf.additional_comments||''],
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
    ['','','','','','Sub Total',fin.sub_total||0],
    ['','','','','',fin.discount_label||'Discount',fin.discount||0],
    ['','','','','','Transport Charges',fin.transportation_charges||0],
    ['','','','','','TOTAL',fin.total||0],
  ],'Order Items',[5,14,54,16,6,15,15],[{s:{r:0,c:0},e:{r:0,c:6}}]);

  // Sheet 4 — Financial Summary
  add([
    ['FINANCIAL SUMMARY'],[''],
    ['DESCRIPTION','AMOUNT','NOTES'],
    ['Sub Total',fin.sub_total||0,'Sum of all line items'],
    [fin.discount_label||'Discount',fin.discount||0,'Applied discount'],
    ['Transport Charges',fin.transportation_charges||0,'Delivery / shipping costs'],
    ['TOTAL PAYABLE',fin.total||0,'Final amount due'],
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
