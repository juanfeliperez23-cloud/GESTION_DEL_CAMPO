export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
export const key=(h,s)=>[h,s].map(x=>String(x??'').trim().toUpperCase().replace(/^0+/,'')||'0').join('|');
export function isoDate(v){
 if(v===null||v===undefined||v==='')return null;
 if(v instanceof Date)return isNaN(v)?null:v.toISOString().slice(0,10);
 if(typeof v==='number')return Number.isFinite(v)&&v>=1&&v<150000?new Date(Math.round((v-25569)*86400000)).toISOString().slice(0,10):null;
 const s=String(v).trim();let d=s.slice(0,10);if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))d=s.slice(6)+'-'+s.slice(3,5)+'-'+s.slice(0,2);
 const t=Date.parse(d+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d?d:null;
}
export function cycle(p,asOf){
 const dates=[['Siembra',isoDate(p.siembra)],['Última cosecha',isoDate(p.cosecha)]].filter(x=>x[1]).sort((a,b)=>b[1].localeCompare(a[1]));
 if(!dates.length)return {start:null,reason:'Falta fecha de siembra o última cosecha; no se puede delimitar el ciclo.',months:null};
 const [reason,start]=dates[0];return {start,reason,months:Math.max(0,(Date.parse(asOf)-Date.parse(start))/86400000/30.4375)};
}
const CLASSES={ABO:'Abonamiento',VIN:'Aplicación de vinaza',CMA:'Control de malezas',CME:'Control de malezas',CMF:'Control fitosanitario',CBL:'Control biológico',CPC:'Control de plagas',DRE:'Drenajes',MHV:'Mantenimiento e infraestructura',RGV:'Riego',RGT:'Riego',RIE:'Riego',RMI:'Infraestructura de riego',RAP:'Riego',DPJ:'Despaje',RES:'Resiembra',PRE:'Preparación de suelos',SIE:'Siembra',SUB:'Subsuelo',CUL:'Cultivo',MAD:'Maduración',ADE:'Adecuación',ALE:'Alce',INA:'Investigación y apoyo',CSE:'Cosecha',TRT:'Transporte'};
export const jobClass=j=>CLASSES[j[7]]||('Otras labores · '+(j[7]||'sin grupo'));
export function currentJobs(p,jobs,asOf){const c=cycle(p,asOf);return {cycle:c,jobs:c.start?jobs.filter(j=>j[0]>=c.start&&j[0]<=asOf):[]};}
export function buildImport(rows,type,current,asOf,source){
 const head=rows[0]?.map(norm)||[];const idx=n=>head.indexOf(norm(n));
 const required=type==='labores'?['Fecha','Hacienda','Suerte','Nombre Labor','Labor','Unidad de Medida','Unidades','Nombre Prest.Servicios','Conj.Labores']:['Cod. Hacienda','Cod. Suerte','Nombre del Hacienda','Edad','Fecha Siembra','Fecha Ult.Cosecha','Grupo Tenencia','Nombre Grupo de Abonos'];
 const absent=required.filter(x=>idx(x)<0);if(absent.length)throw Error('Este Excel no tiene las columnas requeridas: '+absent.join(', '));
 const get=(r,n)=>r[idx(n)],text=(r,n)=>String(get(r,n)??'').trim().slice(0,300);
 const number=(r,n)=>{const v=get(r,n);if(v===null||v===undefined||v==='')return null;const n2=typeof v==='number'?v:Number(String(v).replace(',','.'));return Number.isFinite(n2)?n2:null;};
 const lookup=new Map(Object.entries(current.properties).map(([id,p])=>[key(p.codHacienda,p.suerte),id]));
 let matched=0,unmatched=0,invalid=0,duplicates=0;const jobs={},props={},seen=new Map();let min=null,max=null;
 for(let row=1;row<rows.length;row++){
  const r=rows[row];if(!r.some(x=>x!==null&&x!==''&&x!==undefined))continue;
  const id=lookup.get(type==='labores'?key(get(r,'Hacienda'),get(r,'Suerte')):key(get(r,'Cod. Hacienda'),get(r,'Cod. Suerte')));
  if(!id){unmatched++;continue;}
  if(type==='labores'){
   const date=isoDate(get(r,'Fecha')),area=number(r,'Unidades'),unit=text(r,'Unidad de Medida').toUpperCase(),name=text(r,'Nombre Labor');
   if(!date||area===null||area<0||!unit||!name){invalid++;continue;}
   matched++;min=min===null||date<min?date:min;max=max===null||date>max?date:max;
   const signature=JSON.stringify(r);if(seen.has(signature)){seen.get(signature)[9]++;duplicates++;continue;}
   const j=[date,text(r,'Labor'),name,area,unit,text(r,'Nombre Prest.Servicios'),text(r,'Prest.Servicios'),text(r,'Conj.Labores'),row+1,1];seen.set(signature,j);(jobs[id]??=[]).push(j);
  }else{
   if(props[id])throw Error('El Excel de suertes repite el código '+id+'. Corrige el archivo antes de actualizar.');
   const dateFields=['Fecha Siembra','Fecha Ult.Cosecha'];if(dateFields.some(n=>get(r,n)&&!isoDate(get(r,n)))){invalid++;continue;}
   matched++;const p={...current.properties[id]};
   const strings={'Nombre del Hacienda':'hacienda','Nombre Variedad':'variedad','Nombre Orden Suelo':'suelo','Nombre Topografia':'topografia','Grupo Tenencia':'grupoTenencia','Grupo de Abonos':'grupoAbonos','Nombre Grupo de Abonos':'nombreGrupoAbonos','Zona Agroecologica':'zona','Nombre Vulnerabilidad':'vulnerabilidad'};
   for(const [col,field] of Object.entries(strings))if(idx(col)>=0)p[field]=text(r,col);
   for(const [col,field] of Object.entries({'Area Total':'area','Edad':'edad','Numero de Cortes':'cortes','Distancia(metros) entre surcos':'surcos','T/H Ult.Cosecha':'tch'}))if(idx(col)>=0)p[field]=number(r,col);
   if(idx('Distancia')>=0){const value=number(r,'Distancia');p.distanciaIngenio=Number.isFinite(value)&&value>=0?value:null;p.distanciaIngenioFuente=source+' · columna Distancia · corte '+asOf;}p.siembra=isoDate(get(r,'Fecha Siembra'));p.cosecha=isoDate(get(r,'Fecha Ult.Cosecha'));p.fechaCorte=asOf;props[id]=p;
  }
 }
 if(!matched)throw Error('No hay filas válidas que coincidan con las suertes del mapa.');
 for(const a of Object.values(jobs))a.sort((a,b)=>b[0].localeCompare(a[0])||a[1].localeCompare(b[1])||a[8]-b[8]);
 const meta=type==='labores'?{laboresSource:source,laboresDesde:min,laboresHasta:max,rows:rows.length-1,unmatched,uniqueMatched:matched-duplicates,duplicateMatched:duplicates,invalidRows:invalid}:{fichasSource:source,fichasCorte:asOf};
 return {type,jobs,properties:props,meta,summary:{matched,unmatched,invalid,duplicates,unchanged:type==='fichas'?lookup.size-matched:0}};
}
// Consecutive calendar days form one execution; no aggregation across gaps.
// Exact source duplicates carry multiplicity j[9], never extra area.
export function groupExecutions(rows){
 const types=new Map();for(const j of rows){const k=JSON.stringify([j[1],j[2],j[4],j[7]]);if(!types.has(k))types.set(k,[]);types.get(k).push(j);}
 const result=[];
 for(const entries of types.values()){
  entries.sort((a,b)=>a[0].localeCompare(b[0])||a[8]-b[8]);let run=null;
  for(const j of entries){
   const days=run?(Date.parse(j[0])-Date.parse(run.end))/86400000:Infinity;
   if(!run||days>1){run={start:j[0],end:j[0],code:j[1],name:j[2],unit:j[4],group:j[7],category:jobClass(j),area:0,providers:new Map(),rows:0,repeated:0,days:new Set()};result.push(run);}
   run.end=j[0];run.area+=j[3];run.rows++;run.repeated+=(j[9]||1)-1;run.days.add(j[0]);
   const pk=JSON.stringify([j[6],j[5]]),pr=run.providers.get(pk)||{name:j[5]||'Sin prestador informado',id:j[6],area:0};pr.area+=j[3];run.providers.set(pk,pr);
  }
 }
 return result.map(r=>({...r,area:Math.round(r.area*1e6)/1e6,providers:[...r.providers.values()],days:r.days.size})).sort((a,b)=>b.end.localeCompare(a.end)||a.name.localeCompare(b.name,'es'));
}
