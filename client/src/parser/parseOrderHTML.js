// ────────────────────────────────────────────────
//  CORE PARSER — 100% client-side, no API
//  NOTE: Parser logic is UNCHANGED from the original single-file build.
//        Only `export` was added. Do not modify the parsing rules here.
// ────────────────────────────────────────────────
export function parseOrderHTML(htmlText){
  const doc=new DOMParser().parseFromString(htmlText,'text/html');
  doc.querySelectorAll('script,style,link,noscript,meta').forEach(e=>e.remove());

  const R={
    order_info:{order_ref:'',customer_id:'',order_date:'',representative:'',po_number:'',payment_type:'',additional_comments:''},
    billing_address:{company_name:'',contact_name:'',address:'',city:'',county:'',country:'',post_code:'',phone:''},
    delivery_address:{company_name:'',contact_name:'',address:'',city:'',county:'',country:'',post_code:'',phone:''},
    line_items:[],
    financials:{sub_total:0,transportation_charges:0,discount:0,discount_label:'Discount',total:0,currency:'GBP'}
  };

  // Detect currency from page
  const allTxt=(doc.body||doc.documentElement).textContent||'';
  if(allTxt.includes('£')) R.financials.currency='GBP';
  else if(allTxt.includes('€')) R.financials.currency='EUR';
  else if(allTxt.includes('$')) R.financials.currency='USD';

  // Flatten ALL tr→cells from the document (handles nested tables too)
  const rows=[];
  doc.querySelectorAll('tr').forEach(tr=>{
    const cells=[...tr.querySelectorAll('td,th')].map(td=>td.textContent.replace(/\s+/g,' ').trim());
    const nonempty=cells.filter(c=>c.length>0);
    if(nonempty.length>0) rows.push(cells);
  });

  const parseNum=s=>{
    if(!s) return 0;
    const neg=String(s).includes('-')||String(s).startsWith('(');
    const n=parseFloat(String(s).replace(/[^0-9.]/g,''));
    return isNaN(n)?0:(neg?-n:n);
  };

  const getVal=cells=>{
    // Pattern: [Label, ':', Value] → return Value
    // Pattern: [Label, Value] → return Value
    const idx=cells.indexOf(':');
    if(idx>=0 && idx<cells.length-1) return cells.slice(idx+1).find(c=>c)||'';
    return cells.slice(1).find(c=>c&&c!==':')||'';
  };

  let mode='';
  const setAddr=(addr,field,val)=>{
    const f=field.toLowerCase();
    if(/company/.test(f)) addr.company_name=val;
    else if(/contact/.test(f)) addr.contact_name=val;
    else if(/^address/.test(f)) addr.address=val;
    else if(/^city$/.test(f)) addr.city=val;
    else if(/county/.test(f)) addr.county=val;
    else if(/country/.test(f)) addr.country=val;
    else if(/post|zip/.test(f)) addr.post_code=val;
    else if(/phone|tel/.test(f)) addr.phone=val;
  };

  rows.forEach(cells=>{
    const row=cells.join(' ');
    const low=row.toLowerCase();

    // ── section detection ──
    if(/order details/i.test(row)&&cells.length<=3){mode='hdr';return}
    if(/portal order ref/i.test(row)||/customer id/i.test(row)){mode='hdr'}
    if(/^billing address$/i.test(row.trim())){mode='billing';return}
    if(/^delivery address$/i.test(row.trim())){mode='delivery';return}
    if(/unit price/i.test(row)&&/qty|quantity/i.test(row)){mode='items';return}
    if(/additional comment/i.test(row)){mode='comments';return}

    // Detect side-by-side address row (has both billing and delivery fields in one row)
    if(cells.length>=8&&/company name/i.test(cells[0])&&/company name/i.test(cells[3]||'')){
      setAddr(R.billing_address,cells[0],cells[2]||cells[1]||'');
      setAddr(R.delivery_address,cells[3],cells[5]||cells[4]||'');return;
    }

    // ── financial totals (detect before items to avoid false item parse) ──
    if(/sub.?total/i.test(low)&&!/product|description/i.test(low)){
      R.financials.sub_total=Math.abs(parseNum(cells[cells.length-1]));return;
    }
    if(/transport/i.test(low)&&/charge/i.test(low)){
      R.financials.transportation_charges=Math.abs(parseNum(cells[cells.length-1]));return;
    }
    if(/discount/i.test(low)&&cells.length<=4&&!/product|desc/i.test(low)){
      R.financials.discount_label=cells[0];
      R.financials.discount=parseNum(cells[cells.length-1]);return;
    }
    if(/^total[:\s]*$/i.test(low.trim())||(cells.length<=3&&/total/i.test(cells[0])&&!/sub|transport|discount/i.test(low))){
      const v=parseNum(cells[cells.length-1]);
      if(v>0) R.financials.total=v;return;
    }

    // ── parse by mode ──
    if(mode==='hdr'&&cells.length>=2){
      const f=cells[0].toLowerCase(),v=getVal(cells);
      if(/portal order ref|ref no/i.test(f)) R.order_info.order_ref=v;
      else if(/customer id/i.test(f)) R.order_info.customer_id=v;
      else if(/order date/i.test(f)) R.order_info.order_date=v;
      else if(/representative/i.test(f)) R.order_info.representative=v;
      else if(/po number/i.test(f)) R.order_info.po_number=v;
      else if(/payment type/i.test(f)) R.order_info.payment_type=v;
    }

    if((mode==='billing'||mode==='delivery')&&cells.length>=2){
      const addr=mode==='billing'?R.billing_address:R.delivery_address;
      setAddr(addr,cells[0],getVal(cells));
    }

    if(mode==='items'&&cells.length>=4){
      // Expected: [code, description, package, qty, unit_price, total]
      // or:       [description, package, qty, unit_price, total]
      const last=parseNum(cells[cells.length-1]);
      const secondLast=parseNum(cells[cells.length-2]);
      const qty=parseInt(cells[cells.length-3])||0;
      const pkg=cells[cells.length-4]||'';

      if(qty>0&&secondLast>0&&last>0&&pkg){
        let desc='',code='N.A';
        if(cells.length>=6){desc=cells[cells.length-5];code=cells[cells.length-6]||'N.A';}
        else{desc=cells[0];}
        if(desc&&desc.length>2&&!/total|charge|discount/i.test(desc)){
          R.line_items.push({product_code:code||'N.A',description:desc,package:pkg,qty,unit_price:secondLast,total:last});
        }
      }
    }

    if(mode==='comments'){
      const v=cells.find(c=>c&&!/additional comment/i.test(c));
      if(v) R.order_info.additional_comments=v;
    }
  });

  // Fallback: if total not found, compute from sub_total + charges + discount
  if(!R.financials.total&&R.financials.sub_total){
    R.financials.total=R.financials.sub_total+R.financials.transportation_charges+R.financials.discount;
  }

  return R;
}
