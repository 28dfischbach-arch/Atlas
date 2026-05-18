(function(){
'use strict';

function getLS(k,fb){try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch(e){return fb;}}
function setLS(k,v){localStorage.setItem(k,JSON.stringify(v));}
function getShopify(){return getLS('atlas_shopify',null);}
function escHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}

const STATUS_COLORS={
  Pending:{bg:'#fef3c7',color:'#92400e'},
  Processing:{bg:'#dbeafe',color:'#1e40af'},
  Shipped:{bg:'#ede9fe',color:'#5b21b6'},
  Delivered:{bg:'#d1fae5',color:'#065f46'},
  Cancelled:{bg:'#f3f4f6',color:'#6b7280'}
};
const STATUS_ORDER=['Pending','Processing','Shipped','Delivered'];

let state = {
  products: getLS('store_products',[]),
  orders: getLS('store_orders',[]),
  orderFilter: 'All',
  editProductId: null,
};

// ─── NAV ──────────────────────────────────────────────────
window.setView = function(v){
  document.querySelectorAll('.sp-view').forEach(el=>el.style.display='none');
  document.getElementById('view-'+v).style.display='';
  document.querySelectorAll('.sp-nav-item[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===v));
  if(v==='overview') renderOverview();
  if(v==='orders') renderOrders();
  if(v==='products') renderProducts();
  if(v==='analytics') renderAnalytics();
};

window.openSettings = function(){ parent.postMessage({type:'atlas-open',app:'settings'},'*'); };

// ─── SHOPIFY STATUS ───────────────────────────────────────
function checkShopifyStatus(){
  const sh=getShopify();
  const nameEl=document.getElementById('storeName');
  if(sh&&sh.domain&&nameEl){
    nameEl.textContent=sh.domain.replace('.myshopify.com','');
  }
}

window.syncShopify = function(){
    const sh=getShopify();
    if(!sh||!sh.domain){
      alert('Add your Shopify credentials in Settings first.');
    } else {
      alert('Shopify live sync is not available in the standalone version. Manage products and orders locally — they will be included in any Shopify export from SiteBuilder.');
    }
  };

// ─── OVERVIEW ─────────────────────────────────────────────
function renderOverview(){
  const revenue=state.orders.filter(o=>o.status!=='Cancelled').reduce((s,o)=>s+o.total,0);
  const pending=state.orders.filter(o=>o.status==='Pending').length;
  const lowStock=state.products.filter(p=>Number(p.stock)<=10).length;

  document.getElementById('overviewRevenue').textContent='$'+revenue.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('overviewOrders').textContent=state.orders.length;
  document.getElementById('overviewProducts').textContent=state.products.length;
  document.getElementById('overviewLowStock').textContent=lowStock;

  const pendingBadge=document.getElementById('pendingBadge');
  pendingBadge.textContent=pending;
  pendingBadge.style.display=pending?'':'none';

  // Recent orders
  const list=document.getElementById('recentOrdersList');
  const recent=state.orders.slice(0,6);
  list.innerHTML=recent.length
    ? recent.map(o=>{
        const sc=STATUS_COLORS[o.status]||{bg:'#f3f4f6',color:'#6b7280'};
        return '<div class="sp-order-row">'
          +'<span class="sp-order-id">'+escHtml(o.id)+'</span>'
          +'<span class="sp-order-customer">'+escHtml(o.customer)+'</span>'
          +'<span class="sp-status-pill" style="background:'+sc.bg+';color:'+sc.color+'">'+escHtml(o.status)+'</span>'
          +'<span class="sp-order-total">$'+o.total.toFixed(2)+'</span>'
          +'</div>';
      }).join('')
    : '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No orders yet</div>';

  renderMap();
}

// ─── MAP ─────────────────────────────────────────────────
const CITY_COORDS = {
  'New York':[.78,.32],'Los Angeles':[.16,.38],'Chicago':[.72,.29],'Houston':[.62,.44],
  'London':[.47,.22],'Paris':[.49,.23],'Tokyo':[.84,.28],'Sydney':[.88,.72],
  'Toronto':[.75,.27],'Berlin':[.52,.21],'Dubai':[.62,.36],'Singapore':[.79,.5],
  'Miami':[.74,.43],'Dallas':[.62,.41],'Seattle':[.17,.23],'Atlanta':[.73,.39],
};

function renderMap(){
  const mapSvg=document.getElementById('orderMap');
  const dotsEl=document.getElementById('mapDots');
  // Simple world map path
  mapSvg.innerHTML='<rect width="900" height="500" fill="#e8f4f8" rx="4"/><path d="M50,180 Q200,120 350,130 Q450,125 500,140 Q560,130 620,145 Q700,135 780,155 Q830,165 870,180 L870,320 Q800,340 720,330 Q650,340 600,330 Q540,345 480,340 Q400,360 320,350 Q250,365 180,345 Q100,360 50,340 Z M200,180 Q250,160 300,165 Q350,155 400,165 L400,280 Q350,295 290,285 Q240,295 200,280 Z" fill="#c8e6c9" opacity=".5"/>';

  dotsEl.innerHTML='';
  const cities={};
  state.orders.forEach(o=>{ if(o.city) cities[o.city]=(cities[o.city]||0)+1; });

  Object.entries(cities).forEach(([city,count])=>{
    const coords=CITY_COORDS[city];
    if(!coords) return;
    const [xr,yr]=coords;
    const wrap=dotsEl.getBoundingClientRect();
    const left=(xr*100)+'%';
    const top=(yr*100)+'%';
    const dot=document.createElement('div');
    dot.className='sp-map-dot';
    dot.style.left=left;
    dot.style.top=top;
    dot.title=city+': '+count+' order'+(count>1?'s':'');
    dot.style.width=(8+count*3)+'px';
    dot.style.height=(8+count*3)+'px';
    dotsEl.appendChild(dot);
  });
}

// ─── ORDERS ───────────────────────────────────────────────
window.setOrderFilter=function(f){
  state.orderFilter=f;
  document.querySelectorAll('.sp-filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  renderOrders();
};

function renderOrders(){
  const filtered=state.orderFilter==='All'?state.orders:state.orders.filter(o=>o.status===state.orderFilter);
  const tbody=document.getElementById('ordersBody');
  tbody.innerHTML=filtered.length
    ? filtered.map(o=>{
        const sc=STATUS_COLORS[o.status]||{bg:'#f3f4f6',color:'#6b7280'};
        const prod=state.products.find(p=>p.id===o.productId);
        const canAdvance=STATUS_ORDER.indexOf(o.status)<STATUS_ORDER.length-1;
        const oid = escHtml(o.id);
        return '<tr>'
          +'<td><span style="font-family:monospace;font-size:11px;color:#6b7280">'+oid+'</span></td>'
          +'<td><strong>'+escHtml(o.customer)+'</strong>'+(o.city?'<br><span style="font-size:11px;color:#9ca3af">'+escHtml(o.city)+'</span>':'')+'</td>'
          +'<td>'+(prod?escHtml(prod.name):escHtml(o.productId||'—'))+(o.size?'<br><span style="font-size:11px;color:#9ca3af">'+escHtml(o.size)+'</span>':'')+'</td>'
          +'<td><strong>$'+o.total.toFixed(2)+'</strong></td>'
          +'<td><span class="sp-status-pill" style="background:'+sc.bg+';color:'+sc.color+'">'+escHtml(o.status)+'</span></td>'
          +'<td style="font-size:11.5px;color:#9ca3af">'+escHtml(o.date||'')+'</td>'
          +'<td>'
          +(canAdvance?'<button class="sp-action-btn" onclick="advanceStatus(&quot;'+oid+'&quot;)">Advance</button>':'')
          +'<button class="sp-action-btn danger" onclick="cancelOrder(&quot;'+oid+'&quot;)">Cancel</button>'
          +'</td></tr>';
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#9ca3af">No orders found</td></tr>';
}

window.advanceStatus=function(id){
  state.orders=state.orders.map(o=>{
    if(o.id!==id) return o;
    const i=STATUS_ORDER.indexOf(o.status);
    return{...o,status:i<STATUS_ORDER.length-1?STATUS_ORDER[i+1]:o.status};
  });
  setLS('store_orders',state.orders);
  renderOrders();
  renderOverview();
};

window.cancelOrder=function(id){
  state.orders=state.orders.map(o=>o.id===id?{...o,status:'Cancelled'}:o);
  setLS('store_orders',state.orders);
  renderOrders();
  renderOverview();
};

window.showAddOrder=function(){
  const sel=document.getElementById('of-product');
  sel.innerHTML=state.products.map(p=>'<option value="'+p.id+'">'+escHtml(p.name)+'</option>').join('');
  ['of-customer','of-size','of-city'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('of-qty').value='1';
  document.getElementById('addOrderModal').style.display='flex';
};

window.submitOrder=function(){
  const customer=document.getElementById('of-customer').value.trim();
  const productId=document.getElementById('of-product').value;
  const size=document.getElementById('of-size').value.trim();
  const qty=parseInt(document.getElementById('of-qty').value)||1;
  const city=document.getElementById('of-city').value.trim();
  const prod=state.products.find(p=>p.id===productId);
  if(!customer||!productId){alert('Fill in customer and product.');return;}
  state.orders.unshift({
    id:'ORD-'+String(Date.now()).slice(-6),
    customer,productId,size,qty,
    total:prod?prod.price*qty:0,
    status:'Pending',
    date:new Date().toISOString().split('T')[0],
    city
  });
  setLS('store_orders',state.orders);
  document.getElementById('addOrderModal').style.display='none';
  renderOrders();
  renderOverview();
};

// ─── PRODUCTS ─────────────────────────────────────────────
function renderProducts(){
  const tbody=document.getElementById('productsBody');
  tbody.innerHTML=state.products.length
    ? state.products.map(p=>{
        const stock=Number(p.stock);
        const stockHtml=stock===0
          ?'<span class="sp-stock-out">Out of Stock</span>'
          :stock<10?'<span class="sp-stock-low">Low ('+stock+')</span>'
          :'<span class="sp-stock-ok">'+stock+'</span>';
        const pid = escHtml(p.id);
        return '<tr>'
          +'<td><div class="sp-product-name">'+escHtml(p.name)+'</div></td>'
          +'<td><span class="sp-sku">'+escHtml(p.sku||'—')+'</span></td>'
          +'<td><span class="sp-cat-tag">'+escHtml(p.category||'—')+'</span></td>'
          +'<td><strong>$'+Number(p.price).toFixed(2)+'</strong></td>'
          +'<td>'+stockHtml+'</td>'
          +'<td><button class="sp-action-btn" onclick="editProduct(&quot;'+pid+'&quot;)">Edit</button>'
          +'<button class="sp-action-btn danger" onclick="deleteProduct(&quot;'+pid+'&quot;)">Delete</button></td>'
          +'</tr>';
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">No products yet</td></tr>';
}

window.showAddProduct=function(){
  state.editProductId=null;
  document.getElementById('productModalTitle').textContent='Add Product';
  ['pf-name','pf-price','pf-stock','pf-cost'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pf-cat').value='Tops';
  document.getElementById('addProductModal').style.display='flex';
};

window.editProduct=function(id){
  const p=state.products.find(pr=>pr.id===id);
  if(!p) return;
  state.editProductId=id;
  document.getElementById('productModalTitle').textContent='Edit Product';
  document.getElementById('pf-name').value=p.name;
  document.getElementById('pf-price').value=p.price;
  document.getElementById('pf-stock').value=p.stock;
  document.getElementById('pf-cost').value=p.cost||'';
  document.getElementById('pf-cat').value=p.category||'Tops';
  document.getElementById('addProductModal').style.display='flex';
};

window.submitProduct=function(){
  const name=document.getElementById('pf-name').value.trim();
  const price=parseFloat(document.getElementById('pf-price').value)||0;
  const stock=parseInt(document.getElementById('pf-stock').value)||0;
  const cost=parseFloat(document.getElementById('pf-cost').value)||0;
  const cat=document.getElementById('pf-cat').value;
  if(!name){alert('Enter a product name.');return;}
  if(state.editProductId){
    state.products=state.products.map(p=>p.id===state.editProductId?{...p,name,price,stock,cost,category:cat}:p);
  } else {
    const initials=name.split(' ').map(w=>w[0]?.toUpperCase()||'').join('').slice(0,3);
    const sku=cat.slice(0,2).toUpperCase()+'-'+initials+'-'+Math.floor(Math.random()*900+100);
    state.products.push({id:Date.now().toString(),name,sku,category:cat,price,stock,sizes:[],cost});
  }
  setLS('store_products',state.products);
  document.getElementById('addProductModal').style.display='none';
  renderProducts();
};

window.deleteProduct=function(id){
  if(!confirm('Delete this product?')) return;
  state.products=state.products.filter(p=>p.id!==id);
  setLS('store_products',state.products);
  renderProducts();
};

// ─── ANALYTICS ────────────────────────────────────────────
function renderAnalytics(){
  const nonCanc=state.orders.filter(o=>o.status!=='Cancelled');
  const revenue=nonCanc.reduce((s,o)=>s+o.total,0);
  const units=nonCanc.reduce((s,o)=>s+(o.qty||1),0);
  const cancelCount=state.orders.filter(o=>o.status==='Cancelled').length;
  const cancelRate=state.orders.length?Math.round(cancelCount/state.orders.length*100):0;

  // Top product
  const prodRevenue={};
  nonCanc.forEach(o=>{
    const prod=state.products.find(p=>p.id===o.productId);
    const name=prod?prod.name:o.productId||'Unknown';
    prodRevenue[name]=(prodRevenue[name]||0)+o.total;
  });
  const topProds=Object.entries(prodRevenue).sort((a,b)=>b[1]-a[1]);

  document.getElementById('avgOrder').textContent=nonCanc.length?'$'+(revenue/nonCanc.length).toFixed(2):'$0';
  document.getElementById('totalUnits').textContent=units;
  document.getElementById('cancelRate').textContent=cancelRate+'%';
  document.getElementById('topProduct').textContent=topProds[0]?topProds[0][0]:'—';

  // Status breakdown
  const statusCounts={Pending:0,Processing:0,Shipped:0,Delivered:0,Cancelled:0};
  state.orders.forEach(o=>{if(statusCounts[o.status]!==undefined)statusCounts[o.status]++;});
  const maxCount=Math.max(...Object.values(statusCounts),1);
  const statusBarColors={Pending:'#f59e0b',Processing:'#3b82f6',Shipped:'#8b5cf6',Delivered:'#10b981',Cancelled:'#9ca3af'};
  document.getElementById('statusBreakdown').innerHTML=Object.entries(statusCounts).map(([st,cnt])=>
    '<div class="sp-status-bar-row">'
    +'<span class="sp-status-bar-label">'+st+'</span>'
    +'<div class="sp-status-bar-track"><div class="sp-status-bar-fill" style="width:'+(cnt/maxCount*100)+'%;background:'+statusBarColors[st]+'"></div></div>'
    +'<span class="sp-status-bar-count">'+cnt+'</span>'
    +'</div>'
  ).join('');

  // Top products
  document.getElementById('topProducts').innerHTML=topProds.slice(0,5).map(([name,rev],i)=>
    '<div class="sp-top-product-row">'
    +'<span class="sp-tp-rank">'+(i+1)+'</span>'
    +'<span class="sp-tp-name">'+escHtml(name)+'</span>'
    +'<span class="sp-tp-revenue">$'+rev.toFixed(2)+'</span>'
    +'</div>'
  ).join('')||'<div style="padding:20px;text-align:center;color:#9ca3af">No data yet</div>';
}

// ─── INIT ─────────────────────────────────────────────────
checkShopifyStatus();
renderOverview();

})();