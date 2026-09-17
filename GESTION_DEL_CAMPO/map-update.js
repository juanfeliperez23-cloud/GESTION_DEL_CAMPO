import {readMapFile} from './shapefile-import.js';
import {isAdmin,offlineState,privateJSON,publishMap} from './private-api.js';
const labels={id:'Código único de suerte (igual al cruce del Cronológico)',hacienda:'Nombre de hacienda',codHacienda:'Código de hacienda',suerte:'Número de suerte'};
export function normalizeMap(input,mapping){
 if(input?.type!=='FeatureCollection'||!Array.isArray(input.features)||!input.features.length||input.features.length>20000)throw Error('Se requiere una colección GeoJSON de 1 a 20.000 suertes.');
 if(input.crs&&!JSON.stringify(input.crs).match(/4326|CRS84/i))throw Error('Exporta en WGS84 EPSG:4326.');
 const ids=new Set();let vertices=0;
 const features=input.features.map((f,i)=>{
  const props={};for(const k of Object.keys(labels)){const v=k==='id'&&mapping[k]==='@id'?f.id:f.properties?.[mapping[k]];if(v===null||v===undefined||!String(v).trim())throw Error(`Fila ${i+1}: falta ${labels[k]}.`);props[k]=String(v).trim();if(props[k].length>120)throw Error('Texto demasiado largo.');}
  if(!/^[a-zA-Z0-9_-]+$/.test(props.id)||ids.has(props.id))throw Error('Código inválido o repetido: '+props.id);ids.add(props.id);
  const g=f.geometry;if(!['Polygon','MultiPolygon'].includes(g?.type))throw Error('Solo se admiten polígonos: '+props.id);
  const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  if(!Array.isArray(polygons)||!polygons.length)throw Error('Geometría vacía.');
  const bbox=[Infinity,Infinity,-Infinity,-Infinity];
  const coordinates=polygons.map(poly=>{if(!Array.isArray(poly)||!poly.length)throw Error('Polígono vacío.');return poly.map(ring=>{
   if(!Array.isArray(ring)||ring.length<4)throw Error('Anillo incompleto: '+props.id);
   const clean=ring.map(c=>{if(!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<-180||c[0]>180||c[1]<-85||c[1]>85)throw Error('Coordenadas inválidas; exporta EPSG:4326.');if(++vertices>2000000)throw Error('Mapa demasiado complejo.');bbox[0]=Math.min(bbox[0],c[0]);bbox[1]=Math.min(bbox[1],c[1]);bbox[2]=Math.max(bbox[2],c[0]);bbox[3]=Math.max(bbox[3],c[1]);return [c[0],c[1]];});
   if(clean[0][0]!==clean.at(-1)[0]||clean[0][1]!==clean.at(-1)[1])throw Error('Anillo sin cerrar: '+props.id);
   if(bbox[0]===bbox[2]||bbox[1]===bbox[3])throw Error('Polígono sin extensión.');return clean;
  });});
  return {type:'Feature',id:props.id,bbox,properties:props,geometry:{type:'MultiPolygon',coordinates}};
 });return {type:'FeatureCollection',features};
}
export function installMapUpdate({current,fieldData,isRecording,toast}){
 if(!isAdmin()||offlineState())return;
 const button=document.createElement('button');button.className='secondary full mt';button.textContent='Actualizar mapa de suertes';document.getElementById('open-data').after(button);
 const d=document.createElement('dialog');d.innerHTML='<div class="dialog-head"><h2>Actualizar mapa de suertes</h2><button class="icon-btn" data-close>×</button></div><p>Carga el ZIP completo de tu cartografía o un GeoJSON WGS84 (EPSG:4326). Reemplaza la cartografía para todos los usuarios.</p><p>El ZIP debe contener SHP, SHX, DBF y PRJ del mismo nombre; incluye CPG si está disponible. Conversión local. Conserva los códigos de las suertes existentes.</p><input data-file type="file" accept=".zip,.geojson,.json"><div data-fields></div><p data-status role="status"></p><button class="secondary full" data-preview disabled>Revisar cambios</button><button class="secondary full mt" data-backup>Descargar respaldo del mapa actual</button><label><input type="checkbox" data-confirm> Confirmo que es el mapa completo y revisé las suertes retiradas.</label><button class="primary full" data-save disabled>Publicar mapa en Supabase</button>';document.body.append(d);
 const q=s=>d.querySelector(s);let raw,candidate,reviewed=false,backed=false;
 function reset(){candidate=null;reviewed=false;q('[data-save]').disabled=true;q('[data-confirm]').checked=false;}
 button.onclick=()=>{if(isRecording())return toast('Finaliza el recorrido antes de actualizar.');d.showModal();};q('[data-close]').onclick=()=>d.close();
 q('[data-file]').onchange=async e=>{reset();q('[data-file]').disabled=true;q('[data-preview]').disabled=true;try{const f=e.target.files[0];if(!f)return;if(f.size>40e6)throw Error('Máximo 40 MB.');q('[data-status]').textContent='Leyendo y convirtiendo la cartografía…';raw=await readMapFile(f);const keys=[...new Set((raw.features||[]).slice(0,100).flatMap(f=>Object.keys(f.properties||{})))];const box=q('[data-fields]');box.replaceChildren();for(const [k,label] of Object.entries(labels)){const l=document.createElement('label');l.textContent=label;const select=document.createElement('select');select.dataset.field=k;for(const key of (k==='id'?['@id',...keys]:keys)){const o=document.createElement('option');o.value=key;o.textContent=key==='@id'?'ID del Feature':key;select.append(o);}const aliases={id:['id','HDASTE'],hacienda:['hacienda','HACIENDA'],codHacienda:['codHacienda','COD'],suerte:['suerte','Suerte']};const match=aliases[k].find(x=>keys.includes(x));if(match)select.value=match;select.onchange=reset;l.append(select);box.append(l);}q('[data-preview]').disabled=false;q('[data-status]').textContent='Selecciona las columnas y revisa los cambios.';}catch(e){q('[data-status]').textContent=e.message;}finally{q('[data-file]').disabled=false;}};
 q('[data-preview]').onclick=()=>{reset();try{const mapping=Object.fromEntries([...d.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value]));candidate=normalizeMap(raw,mapping);const old=new Map(current.features.map(f=>[String(f.id),f]));let added=0,changed=0,missing=0;for(const f of candidate.features){const prev=old.get(f.id);if(!prev)added++;else if(JSON.stringify(prev.geometry)!==JSON.stringify(f.geometry))changed++;if(!fieldData.properties[f.id])missing++;if(prev)f.properties={...prev.properties,...f.properties};}
 const next=new Set(candidate.features.map(f=>f.id)),removed=current.features.filter(f=>!next.has(String(f.id)));
 q('[data-status]').textContent=`Total: ${candidate.features.length}. Nuevas: ${added}. Geometrías modificadas: ${changed}. Retiradas: ${removed.length}. Sin ficha del Cronológico: ${missing}. Retiradas: ${removed.map(f=>f.id).join(', ')||'ninguna'}. Los registros históricos no se borran; las suertes retiradas dejan de aparecer en el mapa. Revisa topología y solapamientos en tu GIS antes de publicar.`;
 reviewed=true;enable();}catch(e){q('[data-status]').textContent=e.message;}};
 function enable(){q('[data-save]').disabled=!(reviewed&&backed&&q('[data-confirm]').checked);}
 q('[data-confirm]').onchange=enable;
 q('[data-backup]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(current)],{type:'application/geo+json'}));const a=document.createElement('a');a.href=url;a.download='Mapa_suertes_respaldo_'+new Date().toISOString().slice(0,10)+'.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);backed=true;enable();};
 q('[data-save]').onclick=async()=>{q('[data-save]').disabled=true;try{if(isRecording())throw Error('Finaliza el recorrido.');const fresh=await privateJSON('lotes.json');if(JSON.stringify(fresh)!==JSON.stringify(current))throw Error('El mapa cambió. Cierra y vuelve a abrir la app antes de publicar.');await publishMap(candidate);q('[data-status]').textContent='Mapa publicado. Recargando…';location.reload();}catch(e){q('[data-status]').textContent=e.message;enable();}};
}
