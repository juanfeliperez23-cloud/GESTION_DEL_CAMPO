import {privateJSON,setLoadedStamp,canHarvest,publishOperational} from './private-api.js';
import {currentJobs,groupExecutions,isoDate,jobClass} from './data-model.js';
import {getMeta,setMeta} from './store.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:2}),date=s=>s?s.slice(0,10).split('-').reverse().join('/'):'Sin fecha';
export async function loadFieldData(){let data=await privateJSON('datos-campo.json');if(data.schema!=='mayaguez-datos-v1')throw Error('Base incompatible');setLoadedStamp(data);if(canHarvest()&&(!data.sucrose||!data.fuels)){const seed=await privateJSON('cosecha-base.json');data={...seed,...data};}const fallback=await privateJSON('distancias-base.json');for(const [id,v] of Object.entries(data.properties))if(!Object.hasOwn(v,'distanciaIngenio')&&fallback[id])Object.assign(v,fallback[id]);if(!data.lara)data.lara=await privateJSON('lara-base.json');if(data.lara.schema!=='mayaguez-lara-v1')throw Error('Base LARA incompatible');return data;}
export function installLabores({data,features,selectLot,toast,isRecording}){
 const $=id=>document.getElementById(id),byId=new Map(features.map(f=>[f.id,f]));let limit=40,current=[];
 const opts=features.map(f=>`<option value="${esc(f.id)}">${esc(f.properties.hacienda)} · ${esc(f.properties.suerte)} (${esc(f.id)})</option>`).join('');
 $('jobs-lot').innerHTML='<option value="">Selecciona una suerte</option>'+opts;
 $('jobs-date').value=data.meta.laboresHasta||new Date().toISOString().slice(0,10);
 function render(reset=false){
  const id=$('jobs-lot').value,f=byId.get(id);if(!f){$('jobs-list').innerHTML='<div class="empty">Selecciona una suerte o ábrela en el mapa para consultar sus labores.</div>';$('jobs-cycle').textContent='';$('jobs-count').textContent='';return;}
  const asOf=isoDate($('jobs-date').value);if(!asOf){$('jobs-cycle').textContent='Selecciona una fecha de consulta válida.';return;}
  const raw=data.jobs[id]||[],{cycle,jobs}=currentJobs(f.properties,raw,asOf);current=groupExecutions(jobs);
  const cutoff=data.meta.laboresHasta,coverage=data.meta.laboresDesde;const warnings=[];
  if(!cycle.start)warnings.push(cycle.reason);
  else if(cycle.start>asOf)warnings.push('La fecha de consulta es anterior al inicio del ciclo.');
  if(cycle.start&&coverage&&cycle.start<coverage)warnings.push('Histórico parcial: el reporte comienza el '+date(coverage)+'.');
  if(cutoff&&asOf>cutoff)warnings.push('El reporte contiene labores hasta el '+date(cutoff)+'.');
  $('jobs-cycle').innerHTML=`<b>${esc(f.properties.hacienda)} · Suerte ${esc(f.properties.suerte)}</b><span>${cycle.start?'Ciclo desde '+date(cycle.start)+' · '+esc(cycle.reason):'Ciclo sin fecha confirmada'}</span><span>Edad del ciclo a la consulta: ${cycle.months===null?'—':fmt(cycle.months)+' meses'} · Edad reportada: ${f.properties.edad==null?'—':fmt(f.properties.edad)+' meses'}</span>`+warnings.map(w=>`<p class="data-warning">${esc(w)}</p>`).join('');
  if(reset){const classes=[...new Set(current.map(x=>x.category))].sort();$('jobs-class').innerHTML='<option value="">Todas las clases</option>'+classes.map(c=>`<option>${esc(c)}</option>`).join('');const labs=[...new Set(current.map(x=>x.name))].sort();$('jobs-name').innerHTML='<option value="">Todas las labores realizadas</option>'+labs.map(c=>`<option>${esc(c)}</option>`).join('');}
  const shown=current.filter(x=>(!$('jobs-class').value||x.category===$('jobs-class').value)&&(!$('jobs-name').value||x.name===$('jobs-name').value));
  $('jobs-count').textContent=`${shown.length} ejecuciones agrupadas`;
  $('jobs-list').innerHTML=shown.slice(0,limit).map(j=>`<article class="job-card"><div class="job-card-top"><span>${esc(j.category)} · ${esc(j.group)}</span><time>${date(j.end)}</time></div><h3>${esc(j.name)}</h3><p>${j.days>1?j.days+' días consecutivos · '+date(j.start)+' al '+date(j.end):'Ejecución del '+date(j.end)}</p><dl><div><dt>${j.unit==='HA'?'Área beneficiada reportada':'Cantidad realizada'}</dt><dd>${fmt(j.area)} ${j.unit==='HA'?'ha':esc(j.unit)}</dd></div><div><dt>Prestador del servicio</dt><dd>${j.providers.map(p=>`${esc(p.name)}${j.providers.length>1?' ('+fmt(p.area)+' '+esc(j.unit)+')':''}`).join('<br>')}</dd></div></dl>${j.repeated?`<small>${j.repeated} filas idénticas adicionales agrupadas, sin volver a sumar su área.</small>`:''}</article>`).join('')||'<div class="empty">Sin labores registradas para este ciclo y selección. Esto no demuestra que no se hayan ejecutado.</div>';
  $('jobs-more').hidden=shown.length<=limit;
 }
 $('jobs-lot').onchange=()=>{limit=40;render(true);};$('jobs-date').onchange=()=>{limit=40;render(true);};$('jobs-class').onchange=$('jobs-name').onchange=()=>{limit=40;render();};$('jobs-more').onclick=()=>{limit+=40;render();};$('jobs-map').onclick=()=>{if($('jobs-lot').value)selectLot($('jobs-lot').value);};
 $('data-status').textContent=`${'Base de Supabase'} · Labores ${date(data.meta.laboresDesde)} a ${date(data.meta.laboresHasta)} · ${fmt(data.meta.uniqueMatched)} registros distintos cruzados`;
 $('data-source-summary').textContent=`Fuente: ${fmt(data.meta.rows)} filas. Fuera de las suertes del mapa: ${fmt(data.meta.unmatched)}. Repeticiones exactas entre las filas cruzadas: ${fmt(data.meta.duplicateMatched)}.`;
 $('data-sources').textContent='Cronológico: '+(data.meta.fichasArchivo||'Base original')+' · Pagos y cobros por labor: '+(data.meta.laboresArchivo||'Base original')+' · Ruta de sacarosa: '+(data.sucrose?.meta.source||'Sin archivo')+' · LARA: '+(data.lara?.meta.source||'Sin archivo');
 $('data-cutoff').value=new Date().toISOString().slice(0,10);
 let candidate=null;
 async function parse(file,type){if(!file)return;if(isRecording())return toast('Detén el recorrido antes de actualizar los datos.');
  $('data-apply').hidden=true;candidate=null;$('data-import-status').textContent='Preparando lectura…';['data-fichas','data-jobs','data-sucrose','data-fuels','data-lara'].forEach(id=>$(id).disabled=true);
  const worker=new Worker('./import-worker.js');let timeout=setTimeout(()=>{worker.terminate();finish();$('data-import-status').textContent='La lectura tardó demasiado. Intenta desde el computador.';},180000);
  function finish(){clearTimeout(timeout);worker.terminate();['data-fichas','data-jobs','data-sucrose','data-fuels','data-lara'].forEach(id=>$(id).disabled=false);}
  worker.onmessage=e=>{if(e.data.progress){$('data-import-status').textContent=e.data.progress;return;}finish();if(e.data.error){$('data-import-status').textContent=e.data.error;return;}candidate=e.data.result;candidate.meta={...candidate.meta,[type+'Archivo']:file.name,[type+'Actualizado']:new Date().toISOString()};const s=candidate.summary;$('data-import-status').textContent=`${fmt(s.matched)} filas válidas cruzadas; ${fmt(s.unmatched)} fuera del mapa; ${fmt(s.invalid)} inválidas; ${fmt(s.duplicates)} repeticiones exactas.${type==='fichas'?' '+s.unchanged+' fichas conservarán sus datos anteriores.':type==='sacarosa'?' Se reemplazará toda la Ruta de sacarosa.':type==='lara'?' Se reemplazará la tabla LARA completa. Correcciones de rangos: '+s.corrected+'. Los registros fuera del mapa se conservarán.':type==='combustibles'?' Se actualizarán los meses incluidos.':' Se reemplazará el histórico de labores con este archivo completo.'}`;$('data-apply').hidden=false;};
  worker.onerror=()=>{finish();$('data-import-status').textContent='No se pudo iniciar el lector de Excel. Revisa que import-worker.js y vendor estén publicados.';};
  worker.postMessage({file,type,current:{properties:data.properties},asOf:$('data-cutoff').value});
 }
 $('data-fichas').onchange=e=>parse(e.target.files[0],'fichas');$('data-jobs').onchange=e=>parse(e.target.files[0],'labores');
 $('data-sucrose').onchange=e=>parse(e.target.files[0],'sacarosa');$('data-fuels').onchange=e=>parse(e.target.files[0],'combustibles');$('data-lara').onchange=e=>parse(e.target.files[0],'lara');
 $('data-apply').onclick=async()=>{if(!candidate||isRecording())return;try{const next={...data,local:undefined,lara:candidate.lara||data.lara,sucrose:candidate.sucrose||data.sucrose,fuels:candidate.fuels?{...data.fuels,prices:{...data.fuels?.prices,...candidate.fuels.prices}}:data.fuels,schema:data.schema,properties:{...data.properties,...candidate.properties},jobs:candidate.type==='labores'?candidate.jobs:data.jobs,meta:{...data.meta,...candidate.meta,updatedAt:new Date().toISOString()}};await setMeta('fieldDataOverride',next);location.reload();}catch(e){toast('No se guardó la actualización: '+e.message);}};
 $('data-export').onclick=()=>{const out={...data,local:undefined};const blob=new Blob([JSON.stringify(out)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='datos-campo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 $('prepare-finca').onclick=async()=>{const b=$('prepare-finca');b.disabled=true;$('data-import-status').textContent='Preparando base sin información de sacarosa…';try{await publishOperational();$('data-import-status').textContent='Base de finca preparada. Ya puedes autorizar los usuarios de finca.';}catch(e){$('data-import-status').textContent=e.message;}finally{b.disabled=false;}};
 $('data-published').onclick=async()=>{if(isRecording())return toast('Detén el recorrido antes de cambiar los datos.');location.reload();};
 render();return {select:id=>{if(byId.has(id)){$('jobs-lot').value=id;limit=40;render(true);}}};
}
