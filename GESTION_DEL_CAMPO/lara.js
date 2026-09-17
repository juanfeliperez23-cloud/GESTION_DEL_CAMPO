import {key,norm} from './data-model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined||String(v).trim()===''?null:Number(String(v).trim().replace(',','.'));
const fmt=v=>v.toLocaleString('es-CO',{maximumFractionDigits:2});
// Keep every soil/range candidate. Select using the current Cronológico age at render time.
export function selectLara(p,base){
 const age=number(p.edad);
 if(!Number.isFinite(age)||age<0)return {value:null,reason:'Edad del Cronológico no disponible o inválida.'};
 const records=base?.records?.[key(p.codHacienda,p.suerte)]||[];
 const applicable=records.filter(r=>age>=r[1]&&age<r[2]);
 if(!applicable.length)return {value:null,age,reason:records.length?'La edad reportada no está cubierta por los rangos de esta suerte.':'La suerte no tiene registros en la base de LARA.'};
 const value=Math.max(...applicable.map(r=>r[3]));
 return {value,age,applicable:applicable.length,winners:applicable.filter(r=>r[3]===value)};
}
export function laraDetail(p,base){
 const r=selectLara(p,base);
 if(r.value===null)return '';
 const ranges=[...new Set(r.winners.map(x=>x[1]+'–'+x[2]))].join(' / ');
 return `<section class="lara-card"><h3>LARA · ${esc(ranges)} meses</h3><strong class="lara-value">${fmt(r.value)} mm</strong></section>`;
}

export function buildLara(rows,current,source){
 const head=rows[0]?.map(norm)||[],idx=n=>head.indexOf(norm(n));
 for(const col of ['Hda','Ste','SERIE','Rango'])if(idx(col)<0)throw Error('Falta la columna '+col+' en la tabla LARA.');
 // Original table has two LARA columns: K is the authoritative, last occurrence.
 const li=head.lastIndexOf('lara');if(li<0)throw Error('Falta la columna LARA (K en el archivo original).');
 const records={},seen=new Set(),mapKeys=new Set(Object.values(current.properties).map(p=>key(p.codHacienda,p.suerte)));
 let matched=0,unmatched=0,invalid=0,duplicates=0,corrected=0;
 for(const row of rows.slice(1)){
  if(!row.some(v=>v!==null&&v!==undefined&&v!==''))continue;
  const h=row[idx('Hda')],s=row[idx('Ste')],series=String(row[idx('SERIE')]??'').trim().toUpperCase();
  let range=String(row[idx('Rango')]??'').trim().replace(/\s/g,'').replace(/[–—]/g,'-').replace(/,/g,'.');
  if(range==='4-'){range='4-6';corrected++;}if(range==='2-40'){range='2-4';corrected++;}
  const m=range.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/),value=number(row[li]);
  if(h===null||h===undefined||String(h).trim()===''||s===null||s===undefined||String(s).trim()===''||!series||!m||+m[2]<=+m[1]||!Number.isFinite(value)||value<=0){invalid++;continue;}
  const k=key(h,s),record=[series,+m[1],+m[2],value],sig=JSON.stringify([k,...record]);
  if(seen.has(sig)){duplicates++;continue;}seen.add(sig);
  (records[k]??=[]).push(record);if(mapKeys.has(k))matched++;else unmatched++;
 }
 if(invalid)throw Error(invalid+' filas LARA inválidas. Corrige códigos, serie, rango o valor antes de reemplazar la base.');
 if(!matched)throw Error('La base LARA no tiene registros válidos que coincidan con el mapa.');
 const meta={source,units:'mm',ageUnits:'meses',criterion:'maximum-applicable-range',bounds:'start-inclusive-end-exclusive',corrected};
 return {type:'lara',lara:{schema:'mayaguez-lara-v1',records,meta},properties:{},meta:{laraSource:source},summary:{matched,unmatched,invalid,duplicates,corrected}};
}
