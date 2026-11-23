import {selectLara} from './lara.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null?'Sin dato':v.toLocaleString('es-CO',{maximumFractionDigits:2});
const valid=v=>typeof v==='number'&&Number.isFinite(v);
export const varietyName=p=>String(p.variedad||'Sin variedad informada').trim();
export function varietyStats(features,base){
 const items=[...new Map(features.map(f=>[f.id,f])).values()];
 const ages=items.map(f=>f.properties.edad).filter(v=>valid(v)&&v>=0);
 const tch=items.map(f=>f.properties.tch).filter(v=>valid(v)&&v>0).sort((a,b)=>a-b);
 const areas=items.map(f=>f.properties.area).filter(v=>valid(v)&&v>0);
 const lara=items.map(f=>selectLara(f.properties,base));
 const bins=[{name:'0 a <2',lo:0,hi:2},{name:'2 a <4',lo:2,hi:4},{name:'4 a <6',lo:4,hi:6},{name:'6 a <10',lo:6,hi:10},{name:'10 o más',lo:10,hi:Infinity}].map(b=>({...b,count:ages.filter(a=>a>=b.lo&&a<b.hi).length}));
 return {count:items.length,area:areas.reduce((a,b)=>a+b,0),areaValid:areas.length,ageValid:ages.length,bins,tchValid:tch.length,tchMedian:tch.length?(tch[Math.floor((tch.length-1)/2)]+tch[Math.floor(tch.length/2)])/2:null,laraValid:lara.filter(x=>x.value!==null).length};
}
export function installVariedades({features,data,selectLot,showJobs,openIndices}){
 const $=id=>document.getElementById(id);let visible=[],limit=30;
 const names=[...new Set(features.map(f=>varietyName(f.properties)))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
 $('var-select').innerHTML='<option value="">Todas las denominaciones</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
 const haciendas=[...new Set(features.map(f=>f.properties.hacienda))].sort((a,b)=>a.localeCompare(b,'es'));
 $('var-hacienda').innerHTML='<option value="">Todas las haciendas</option>'+haciendas.map(n=>`<option>${esc(n)}</option>`).join('');
 function render(){
  const selected=$('var-select').value,hacienda=$('var-hacienda').value;
  visible=features.filter(f=>(!selected||varietyName(f.properties)===selected)&&(!hacienda||f.properties.hacienda===hacienda));
  const stats=varietyStats(visible,data.lara),n=stats.count;
  $('var-title').textContent=selected||'Variedades en campo';
  $('var-overview').innerHTML=`<div><b>${fmt(n)}</b><span>Suertes</span></div><div><b>${stats.areaValid?fmt(stats.area):'Sin dato'}</b><span>Área reportada${stats.areaValid<n?' · parcial':''}</span></div><div><b>${fmt(stats.tchMedian)}</b><span>Mediana TCH último corte</span></div>`;
  $('var-coverage').textContent='TCH histórico · último corte';
  const max=Math.max(1,...stats.bins.map(b=>b.count));
  $('var-ages').innerHTML=stats.bins.map(b=>`<div class="var-bar-row"><span>${b.name}</span><div class="var-bar-track"><i style="width:${b.count/max*100}%"></i></div><b>${b.count}</b></div>`).join('');

  const counts=new Map();for(const f of visible){const name=varietyName(f.properties);counts.set(name,(counts.get(name)||0)+1);}
  $('var-catalog').innerHTML=[...counts].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`<button class="var-catalog-row" data-var="${esc(name)}"><span>${esc(name)}</span><b>${count} suertes</b></button>`).join('')||'<p>Sin coincidencias.</p>';
  $('var-list').innerHTML=visible.slice(0,limit).map(f=>{const p=f.properties,r=selectLara(p,data.lara);return `<article class="var-lot"><h3>${esc(p.hacienda)} · ${esc(p.suerte)}</h3><p>${esc(varietyName(p))} · ${fmt(p.edad)} meses</p><div class="var-lot-values"><span>Último TCH <b>${fmt(p.tch)}</b></span>${r.value===null?'':`<span>LARA <b>${fmt(r.value)} mm</b></span>`}</div><div class="row-actions"><button class="secondary" data-var-map="${esc(f.id)}">Mapa y ficha</button><button class="secondary" data-var-jobs="${esc(f.id)}">Labores</button></div></article>`;}).join('')||'<p>Sin suertes para esta selección.</p>';
  $('var-more').hidden=limit>=visible.length;$('var-export').disabled=!visible.length;
 }
 $('var-select').onchange=$('var-hacienda').onchange=()=>{limit=30;render();};
 $('var-more').onclick=()=>{limit+=30;render();};
 $('var-catalog').onclick=e=>{const b=e.target.closest('[data-var]');if(b){$('var-select').value=b.dataset.var;limit=30;render();}};
 $('var-list').onclick=e=>{const b=e.target.closest('[data-var-map],[data-var-jobs]');if(!b)return;if(b.dataset.varMap)selectLot(b.dataset.varMap);else showJobs(b.dataset.varJobs);};
 $('var-indices').onclick=openIndices;
 $('var-export').onclick=()=>{
  const rows=[['Hacienda','Codigo hacienda','Suerte','Variedad reportada','Edad meses','Area reportada (unidad Cronologico)','TCH ultimo corte','LARA maxima mm','Series y rangos del maximo','Estado LARA'],...visible.map(f=>{const p=f.properties,r=selectLara(p,data.lara);return [p.hacienda,p.codHacienda,p.suerte,p.variedad,p.edad,p.area,p.tch,r.value,r.winners?.map(x=>x[0]+' '+x[1]+'-'+x[2]).join('; '),r.reason||'Disponible'];})];
  const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Variedades_Mayaguez.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 };
 render();
}
