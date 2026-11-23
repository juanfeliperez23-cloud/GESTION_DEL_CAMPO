import {isAdmin,offlineState,publishData,refreshFieldCopy} from './private-api.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ensayoKey=(h,s)=>String(h??'').trim().toUpperCase().replace(/^0+(?=\d)/,'')+'|'+String(s??'').trim().toUpperCase().replace(/^0+(?=\d)/,'');
export function matchEnsayos(rows,features){
 const lookup=new Map();for(const f of features){const k=ensayoKey(f.properties.codHacienda,f.properties.suerte);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(String(f.id));}
 const records={},unmatched=[];for(const r of rows){const ids=lookup.get(ensayoKey(r.haciendaCodigo,r.suerte))||[];if(ids.length!==1){unmatched.push(r);continue;}(records[ids[0]]??=[]).push(r);}
 return {records,unmatched};
}
export function installEnsayos({data,features,map,onModeChange,onPaint,toast}){
 let enabled=false;const $=id=>document.getElementById(id);
 const div=document.createElement('details');div.id='ensayos-dropdown';div.className='indices-key';
 div.innerHTML='<summary>Ensayos</summary><div class="indices-body"><label><input id="ensayos-active" type="checkbox"> Activar ensayos</label><p id="ensayos-count"></p><label>Tipo de ensayo<select id="ensayos-type"></select></label><button id="ensayos-extent" class="secondary full mt">Ver suertes con ensayos</button><details><summary>Registros sin cruce con el mapa</summary><div id="ensayos-unmatched"></div></details><p class="small-info">Se resalta la suerte completa. El Excel no contiene el contorno interno del ensayo.</p><label id="ensayos-import-label" hidden>Actualizar Excel de ensayos<input id="ensayos-file" type="file" accept=".xlsx,.xls"></label><p id="ensayos-import-status" role="status"></p></div>';
 $('sat-dropdown').before(div);L.DomEvent.disableClickPropagation(div);L.DomEvent.disableScrollPropagation(div);
 let matched;
 const rows=()=>data.ensayos?.rows||[];
 function rebuild(){matched=matchEnsayos(rows(),features);const types=[...new Set(rows().map(r=>r.tipo.trim()))].sort((a,b)=>a.localeCompare(b,'es'));$('ensayos-type').innerHTML='<option value="">Todos los tipos</option>'+types.map(t=>'<option>'+esc(t)+'</option>').join('');$('ensayos-count').textContent=rows().length?rows().length+' registros · '+Object.keys(matched.records).length+' suertes identificadas · '+matched.unmatched.length+' sin cruce. Fuente: '+(data.ensayos.source||'Excel'):'Sin base de ensayos cargada. El administrador puede importar el Excel con conexión.';$('ensayos-unmatched').innerHTML=matched.unmatched.map(r=>'<p>'+esc(r.haciendaNombre)+' · '+esc(r.suerte)+' · '+esc(r.tipo)+'</p>').join('')||'<p>Ninguno.</p>';$('ensayos-import-label').hidden=!isAdmin()||!!offlineState();}
 const visible=id=>(matched.records[id]||[]).filter(r=>!$('ensayos-type').value||r.tipo.trim()===$('ensayos-type').value);
 function setMode(v){enabled=!!v;$('ensayos-active').checked=enabled;onModeChange(enabled);onPaint();}
 $('ensayos-active').onchange=e=>setMode(e.target.checked);$('ensayos-type').onchange=onPaint;
 $('ensayos-extent').onclick=()=>{const fs=features.filter(f=>visible(f.id).length);if(fs.length)map.fitBounds(L.geoJSON(fs).getBounds(),{padding:[35,70]});else toast('No hay suertes coincidentes para este tipo.');div.open=false;};
 document.addEventListener('satellite-start',()=>{if(enabled)setMode(false);});
 $('ensayos-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const status=$('ensayos-import-status');try{
 if(!isAdmin()||offlineState())throw Error('Usa Conectar para actualizar bases antes de importar.');
 if(file.size>15e6)throw Error('El archivo supera 15 MB.');
 status.textContent='Leyendo Excel…';
 if(!window.XLSX)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/xlsx-0.20.3.min.js';s.onload=resolve;s.onerror=()=>reject(Error('No se pudo abrir el lector Excel.'));document.head.append(s);});
 const w=XLSX.read(await file.arrayBuffer(),{type:'array'});let found=null;
 for(const name of w.SheetNames){const a=XLSX.utils.sheet_to_json(w.Sheets[name],{header:1,defval:''});const idx=a.findIndex(r=>r.includes('HDA-STE')&&r.includes('TIPO DE ENSAYO'));if(idx<0)continue;const h=a[idx];found=a.slice(idx+1).filter(r=>r[h.indexOf('HDA-STE')]!=='').map(r=>({codigo:String(r[h.indexOf('HDA-STE')]),haciendaCodigo:String(r[h.indexOf('Cod. Hacienda')]),haciendaNombre:String(r[h.indexOf('Nombre Hacienda')]),suerte:String(r[h.indexOf('Suerte')]),tipo:String(r[h.indexOf('TIPO DE ENSAYO')])}));break;}
 if(!found?.length||found.some(r=>!r.haciendaCodigo||!r.suerte||!r.tipo))throw Error('Revisa las columnas HDA-STE, Cod. Hacienda, Nombre Hacienda, Suerte y TIPO DE ENSAYO.');
 const check=matchEnsayos(found,features);if(!confirm('Publicar '+found.length+' ensayos: '+Object.keys(check.records).length+' suertes identificadas y '+check.unmatched.length+' registros sin cruce. ¿Continuar?'))return;
 const next={...data,ensayos:{source:file.name,rows:found,importedAt:new Date().toISOString()}};
 await publishData(next);data.ensayos=next.ensayos;rebuild();onPaint();status.textContent='Ensayos publicados. Preparando copia offline…';await refreshFieldCopy();status.textContent='Ensayos publicados y guardados para campo.';
 }catch(err){status.textContent=err.message;}finally{e.target.value='';}};
 rebuild();
 return {isActive:()=>enabled,setMode,style:f=>!enabled?null:{color:visible(f.id).length?'#7b2cbf':'#8a9690',fillColor:'#9d4edd',fillOpacity:visible(f.id).length?.6:0,weight:visible(f.id).length?3:1},detail:id=>!enabled?'':(visible(id).map(r=>'<section class="harvest-detail"><h3>Ensayo · '+esc(r.tipo)+'</h3><dl class="detail-grid">'+[['HDA-STE',r.codigo],['Cod. Hacienda',r.haciendaCodigo],['Nombre Hacienda',r.haciendaNombre],['Suerte',r.suerte],['TIPO DE ENSAYO',r.tipo]].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></section>').join('')||'<p>Esta suerte no tiene ensayos en la selección actual.</p>')};
}
