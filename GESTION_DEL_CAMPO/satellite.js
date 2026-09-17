import {indexResolution,displaySample,nativeSample,polygonMask} from './raster-display.js';
import {isoDate} from './data-model.js';
import {insideRing} from './geo.js';
export const INDICES={
 EVI:{bands:['nir','red','blue'],formula:'2,5 × (B08 − B04) / (B08 + 6 × B04 − 7,5 × B02 + 1)',about:'Vegetación con ajuste atmosférico y de fondo. Reflectancia de superficie; no equivale a producción.',range:[-1,1]},
 SAVI:{bands:['nir','red'],formula:'1,5 × (B08 − B04) / (B08 + B04 + 0,5)',about:'Vegetación ajustada al brillo del suelo. L = 0,5 fijo; no corresponde a LARA.',range:[-1,1]},
 NDVI:{bands:['nir','red'],formula:'(B08 − B04) / (B08 + B04)',about:'Vigor y cobertura vegetal. No equivale a TCH ni a una recomendación de fertilización.',range:[-1,1],colors:[[139,77,43],[246,228,147],[15,117,49]]},
 MSI:{bands:['swir16','nir'],formula:'B11 / B08',about:'Valores mayores pueden indicar menor contenido de agua en la vegetación. Comparar con edad, suelo y visita de campo.',range:[0,3],colors:[[29,126,166],[243,218,123],[174,43,37]]},
 NDWI:{bands:['green','nir'],formula:'(B03 − B08) / (B03 + B08)',about:'NDWI de McFeeters: destaca agua superficial. Para humedad de la vegetación usa la opción NDMI.',range:[-1,1],colors:[[141,108,52],[241,243,239],[15,86,183]]},
 NDMI:{bands:['nir','swir16'],formula:'(B08 − B11) / (B08 + B11)',about:'Humedad de la vegetación; también llamado NDWI NIR–SWIR. Es diferente del NDWI de agua superficial.',range:[-1,1],colors:[[167,76,36],[245,236,179],[21,114,161]]}
};
export function indexValue(name,a,b,c){
 if(!INDICES[name]||![a,b].every(x=>Number.isFinite(x)&&x>=0))return null;
 if(name==='EVI'&&(!Number.isFinite(c)||c<0))return null;
 const d=name==='EVI'?a+6*b-7.5*c+1:name==='SAVI'?a+b+.5:name==='MSI'?b:a+b;
 if(d<=1e-8)return null;
 const v=name==='EVI'?2.5*(a-b)/d:name==='SAVI'?1.5*(a-b)/d:name==='MSI'?a/b:(a-b)/d;
 return Number.isFinite(v)?v:null;
}
export function reflectance(raw,asset,scene){
 const r=asset?.['raster:bands']?.[0];
 if(!r||!Number.isFinite(r.scale)||!Number.isFinite(r.offset))throw Error('La imagen no informa escala y offset de reflectancia. Selecciona otra.');
 if(raw===r.nodata||!Number.isFinite(raw))return null;
 // Earth Search legacy COGs can retain the JP2 offset in raster:bands even
 // though the DN have already been corrected. Never subtract that offset twice.
 const applied=scene?.properties?.['earthsearch:boa_offset_applied']===true;
 const cog=asset?.type?.includes('geotiff')&&asset?.href?.startsWith('https://sentinel-cogs.s3.us-west-2.amazonaws.com/');
 return raw*r.scale+(applied&&cog?0:r.offset);
}
export function featureBounds(f){if(f.type==='FeatureCollection'){const b=f.features.map(featureBounds);return [Math.min(...b.map(x=>x[0])),Math.min(...b.map(x=>x[1])),Math.max(...b.map(x=>x[2])),Math.max(...b.map(x=>x[3]))];}const points=[];function walk(c){if(typeof c[0]==='number')points.push(c);else c.forEach(walk);}walk(f.geometry.coordinates);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
function within(f,x,y){if(f.type==='FeatureCollection')return f.features.some(g=>{const b=g._satBounds;return (!b||(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]))&&within(g,x,y);});const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;return polygons.some(p=>insideRing(x,y,p[0])&&!p.slice(1).some(h=>insideRing(x,y,h)));}
export const OVERLAY_COLORS=[[222,25,40],[255,130,0],[255,235,0],[35,220,65],[0,105,255]];
export function overlayScale(values,index){
 if(['NDVI','EVI','SAVI'].includes(index))return {range:[-1,1],local:false,index};
 const sorted=[...values].sort((a,b)=>a-b),lo=sorted[Math.floor((sorted.length-1)*.05)],hi=sorted[Math.ceil((sorted.length-1)*.95)];
 // Do not exaggerate near-constant values or numerical noise.
 return hi-lo>=.1?{range:[lo,hi],local:true}:{range:INDICES[index].range,local:false};
}
export const VEGETATION_STOPS={
 NDVI:[[-1,[220,0,0]],[.2,[220,0,0]],[.4,[255,130,0]],[.6,[255,230,0]],[.8,[40,200,40]],[1,[0,110,30]]],
 // Display anchors, not calibrated crop/soil classes. Never stretch by parcel.
 EVI:[[-1,[220,0,0]],[0,[220,0,0]],[.2,[255,100,0]],[.4,[255,210,0]],[.7,[40,180,40]],[1,[0,100,30]]],
 SAVI:[[-1,[220,0,0]],[0,[220,0,0]],[.2,[255,100,0]],[.4,[255,210,0]],[.7,[40,180,40]],[1,[0,100,30]]]
};
export function overlayColor(v,range,index){
 const stops=VEGETATION_STOPS[index];
 if(stops){const x=Math.max(-1,Math.min(1,v));for(let i=1;i<stops.length;i++){if(x<=stops[i][0]){const [a,c]=stops[i-1],[b,d]=stops[i],t=(x-a)/(b-a);return c.map((n,k)=>Math.round(n+(d[k]-n)*t));}}}
 const t=Math.max(0,Math.min(1,(v-range[0])/(range[1]-range[0])))*(OVERLAY_COLORS.length-1),i=Math.min(OVERLAY_COLORS.length-2,Math.floor(t)),f=t-i;return OVERLAY_COLORS[i].map((a,k)=>Math.round(a+(OVERLAY_COLORS[i+1][k]-a)*f));
}
export function overlayGradient(index){const stops=VEGETATION_STOPS[index];return stops?stops.map(([v,c])=>'rgb('+c.join(',')+') '+((v+1)*50)+'%').join(','):OVERLAY_COLORS.map(c=>'rgb('+c.join(',')+')').join(',');}
export function cycleStart(feature){return [isoDate(feature.properties?.siembra),isoDate(feature.properties?.cosecha)].filter(Boolean).sort().at(-1)||null;}
const loaded=new Map();async function library(src){if(!loaded.has(src))loaded.set(src,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{loaded.delete(src);reject(Error('No se pudo cargar el lector satelital. Verifica la carpeta vendor.'));};document.head.appendChild(s);}));return loaded.get(src);}
export async function calculateScene(feature,scene,index,signal,options={}){
 await Promise.all([library('./vendor/geotiff.js'),library('./vendor/proj4.js')]);
 const epsg=scene.properties['proj:epsg']||Number(String(scene.properties['proj:code']||'').replace('EPSG:',''));const zone=epsg%100;
 if(!((epsg>=32601&&epsg<=32660)||(epsg>=32701&&epsg<=32760)))throw Error('Proyección de esta imagen no admitida. Selecciona otra escena Sentinel-2.');
 const crs=`+proj=utm +zone=${zone} ${epsg>=32700?'+south ':''}+datum=WGS84 +units=m +no_defs`,project=p=>window.proj4('EPSG:4326',crs,p);
 const bbox=options.bounds||featureBounds(feature),corners=[[bbox[0],bbox[1]],[bbox[0],bbox[3]],[bbox[2],bbox[1]],[bbox[2],bbox[3]]].map(project);
 const resolution=indexResolution(index);
 const bb=[Math.floor(Math.min(...corners.map(p=>p[0]))/resolution)*resolution,Math.floor(Math.min(...corners.map(p=>p[1]))/resolution)*resolution,Math.ceil(Math.max(...corners.map(p=>p[0]))/resolution)*resolution,Math.ceil(Math.max(...corners.map(p=>p[1]))/resolution)*resolution];
 const cells=Math.ceil((bb[2]-bb[0])/resolution)*Math.ceil((bb[3]-bb[1])/resolution);
 if(cells>1000000)throw Error('Esta geometría es demasiado extensa para el teléfono. Consulta por hacienda o por sectores.');
 const names=[...INDICES[index].bands,'scl'];
 async function read(name){const asset=scene.assets[name];if(!asset)throw Error('La escena no contiene todas las bandas requeridas.');const u=new URL(asset.href);if(u.protocol!=='https:'||u.hostname!=='sentinel-cogs.s3.us-west-2.amazonaws.com')throw Error('Origen de imagen no permitido.');
  const tiff=await window.GeoTIFF.fromUrl(u.href,{allowFullFile:false},signal),image=await tiff.getImage(),origin=image.getOrigin(),res=image.getResolution();
  if(!(res[0]>0&&res[1]<0))throw Error('Orientación de raster no admitida.');
  // Native windows and coordinate sampling prevent rounding shifts between 10/20 m bands.
  // Clamp to tile bounds; outside pixels remain nodata, rather than rejecting the whole sector.
  const win=[Math.max(0,Math.floor((bb[0]-origin[0])/res[0])),Math.max(0,Math.floor((bb[3]-origin[1])/res[1])),Math.min(image.getWidth(),Math.ceil((bb[2]-origin[0])/res[0])),Math.min(image.getHeight(),Math.ceil((bb[1]-origin[1])/res[1]))];
  const width=win[2]-win[0],height=win[3]-win[1];if(width<=0||height<=0)throw Error('La escena no cubre el área seleccionada.');
  const raw=await image.readRasters({window:win,samples:[0],interleave:true,signal});return {raw,asset,origin,res,win,width,height};
 }
 const arrays=await Promise.all(names.map(read));
 const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),inverse=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
 const top=merc(bbox[3]),bottom=merc(bbox[1]);
 const gw=Math.max(1,Math.ceil((bbox[2]-bbox[0])*111320*Math.cos((bbox[1]+bbox[3])/2*Math.PI/180)/resolution)),gh=Math.max(1,Math.ceil((bbox[3]-bbox[1])*111320/resolution));
 const grid=new Float32Array(gw*gh);grid.fill(NaN);
 const previous=options.previous;
 if(previous){if(previous.grid.length!==grid.length||JSON.stringify(previous.bbox)!==JSON.stringify(bbox))throw Error('Mosaico con geometría incompatible.');grid.set(previous.grid);}
 let added=0;
 const sceneDay=scene.properties.datetime.slice(0,10);
 const outdated=options.currentCycle?(feature.type==='FeatureCollection'?feature.features:[feature]).filter(f=>{const cut=cycleStart(f);return cut&&cut>=sceneDay;}).map(f=>({...f,_satBounds:featureBounds(f)})):[];
 let blocked=null;
 if(outdated.length){const c=document.createElement('canvas');c.width=gw;c.height=gh;const ctx=c.getContext('2d');polygonMask(ctx,{type:'FeatureCollection',features:outdated},p=>[(p[0]-bbox[0])/(bbox[2]-bbox[0])*gw,(top-merc(p[1]))/(top-bottom)*gh]);blocked=ctx.getImageData(0,0,gw,gh).data;}
 // Read all cells intersecting the bounding rectangle, including polygon edge cells.
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  if(Number.isFinite(grid[y*gw+x]))continue;
  const lon=bbox[0]+(x+.5)/gw*(bbox[2]-bbox[0]),lat=inverse(top-(y+.5)/gh*(top-bottom));
  if(blocked){let hit=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const bx=x+dx,by=y+dy;if(bx>=0&&bx<gw&&by>=0&&by<gh&&blocked[(by*gw+bx)*4+3])hit=true;}if(hit)continue;}
  const xy=project([lon,lat]);if(![4,5,6].includes(nativeSample(arrays.at(-1),xy)))continue;
  const a=reflectance(nativeSample(arrays[0],xy),arrays[0].asset,scene),b=reflectance(nativeSample(arrays[1],xy),arrays[1].asset,scene);
  if(a===null||b===null)continue;const c=index==='EVI'?reflectance(nativeSample(arrays[2],xy),arrays[2].asset,scene):undefined;const value=indexValue(index,a,b,c);if(value!==null){grid[y*gw+x]=value;added++;}
 }
 const factor=4,dw=gw*factor,dh=gh*factor;
 if(dw*dh>16000000)throw Error('El dibujo supera el límite del teléfono. Consulta por sectores.');
 const mask=document.createElement('canvas');mask.width=dw;mask.height=dh;const mctx=mask.getContext('2d');
 polygonMask(mctx,feature,p=>[(p[0]-bbox[0])/(bbox[2]-bbox[0])*dw,(top-merc(p[1]))/(top-bottom)*dh]);
 const alpha=mctx.getImageData(0,0,dw,dh).data,values=[],seen=new Set();let inside=0,validArea=0,totalValue=0,usedNew=false;
 // Statistics use unsmoothed values weighted by their clipped area, never interpolated colours.
 for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
  const weight=alpha[(y*dw+x)*4+3]/255;if(!weight)continue;inside+=weight;
  const i=Math.floor(y/factor)*gw+Math.floor(x/factor),v=grid[i];if(!Number.isFinite(v))continue;
  if(!previous||!Number.isFinite(previous.grid[i]))usedNew=true;
  validArea+=weight;totalValue+=v*weight;if(!seen.has(i)){seen.add(i);values.push(v);}
 }
 if(!values.length)throw Error('No hay píxeles válidos: nubes, sombras o falta de cobertura. Prueba otra fecha.');
 if(previous&&!usedNew)return previous;
 const display=options.fixed?{range:INDICES[index].range,local:false,index}:overlayScale(values,index);
 const canvas=document.createElement('canvas');canvas.width=dw;canvas.height=dh;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(dw,dh);
 for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
  const j=(y*dw+x)*4;if(!alpha[j+3])continue;
  const raw=grid[Math.floor(y/factor)*gw+Math.floor(x/factor)];
  let v=displaySample(grid,gw,gh,(x+.5)/factor-.5,(y+.5)/factor-.5,options.smooth!==false&&!VEGETATION_STOPS[index]);if(v===null)continue;
  // Keep the agreed red class for every valid NDVI source cell <= 0.20.
  if(index==='NDVI'&&raw<=.2)v=raw;
  pixels.data.set([...overlayColor(v,display.range,index),alpha[j+3]],j);
 }
 ctx.putImageData(pixels,0,0);values.sort((a,b)=>a-b);
 const dates=[...new Set([...(previous?.dates||[]),scene.properties.datetime.slice(0,10)])];
 mctx.globalCompositeOperation='source-in';mctx.fillStyle='#e4e7e5';mctx.fillRect(0,0,dw,dh);
 return {...(options.keepGrid?{grid}:{}),dates,maskUrl:mask.toDataURL('image/png'),url:canvas.toDataURL('image/png'),display,bbox,index,scene:scene.id,date:scene.properties.datetime,mean:totalValue/validArea,min:values[0],max:values.at(-1),valid:values.length,coverage:inside?validArea/inside*100:0,resolution,displayResolution:resolution/factor,smooth:options.smooth!==false&&!VEGETATION_STOPS[index]};
}

// Preserve the newest valid cell; older observations fill only missing cells.
export async function calculateComposite(feature,candidates,index,signal,options={}){
 let result=null,lastError=null;const seen=new Set();
 for(const scene of candidates){
  if(seen.has(scene.id))continue;seen.add(scene.id);
  if(signal?.aborted)throw new DOMException('Carga detenida','AbortError');
  try{result=await calculateScene(feature,scene,index,signal,{...options,keepGrid:true,previous:result});}
  catch(e){if(signal?.aborted)throw e;lastError=e;}
  if(result?.coverage>=99.99)break;
 }
 if(!result)throw lastError||Error('No hay píxeles válidos en las imágenes disponibles.');
 delete result.grid;return result;
}

export function intersects(a,b){return a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];}
// Fixed geographic sectors; mask the raster to the union of selected polygons.
export function makeSectors(features,step=.04){
 const sectors=new Map();
 for(const feature of features){const b=featureBounds(feature),f={...feature,_satBounds:b};
  for(let x=Math.floor(b[0]/step);x<Math.ceil(b[2]/step);x++)for(let y=Math.floor(b[1]/step);y<Math.ceil(b[3]/step);y++){
   const id=x+':'+y;if(!sectors.has(id))sectors.set(id,{id,bounds:[x*step,y*step,(x+1)*step,(y+1)*step].map(n=>+n.toFixed(8)),features:[]});sectors.get(id).features.push(f);
  }
 }
 return [...sectors.values()];
}
export function installSatellite({map,features,toast}){
 const $=id=>document.getElementById(id),L=window.L,byId=new Map(features.map(f=>[String(f.id),f]));
 const fmt=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:3}),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let scenes=[],controller=null,generation=0,running=false,progress=null;
 const layer=L.layerGroup().addTo(map),pane=map.createPane('satelliteIndex');pane.style.zIndex='430';pane.style.pointerEvents='none';
 const groups=new Map();for(const f of features){const id=String(f.properties.codHacienda);if(!groups.has(id))groups.set(id,{name:f.properties.hacienda,features:[]});groups.get(id).features.push(f);}
 $('sat-hacienda').innerHTML='<option value="">Selecciona hacienda</option>'+[...groups].sort((a,b)=>a[1].name.localeCompare(b[1].name,'es')).map(([id,g])=>`<option value="${esc(id)}">${esc(g.name)} (${esc(id)})</option>`).join('');
 const now=new Date();$('sat-to').value=now.toISOString().slice(0,10);$('sat-from').value=new Date(now-60*86400000).toISOString().slice(0,10);
 function selected(){const scope=$('sat-scope').value;if(scope==='all')return features;if(scope==='hacienda')return groups.get($('sat-hacienda').value)?.features||[];const f=byId.get($('sat-lot').value);return f?[f]:[];}
 function scopeLabel(){return $('sat-scope').value==='all'?'Todo Mayagüez':$('sat-scope').value==='hacienda'?groups.get($('sat-hacienda').value)?.name||'Hacienda':byId.get($('sat-lot').value)?.properties.hacienda+' · '+byId.get($('sat-lot').value)?.properties.suerte;}
 function syncScope(){const scope=$('sat-scope').value;$('sat-hacienda-wrap').hidden=scope==='all';$('sat-lot-wrap').hidden=scope!=='lot';const lots=groups.get($('sat-hacienda').value)?.features||[];const old=$('sat-lot').value;$('sat-lot').innerHTML='<option value="">Selecciona suerte</option>'+lots.map(f=>`<option value="${esc(f.id)}">${esc(f.properties.suerte)}</option>`).join('');if(lots.some(f=>String(f.id)===old))$('sat-lot').value=old;$('sat-scope-count').textContent=scope==='all'?`${features.length.toLocaleString('es-CO')} suertes · ${groups.size} haciendas`:scope==='hacienda'?`${lots.length} suertes`:'';}
 function abort(){generation++;controller?.abort();controller=null;running=false;$('sat-stop').hidden=true;}
 function remove(){abort();layer.clearLayers();document.dispatchEvent(new Event('satellite-clear'));progress=null;$('sat-map-key').hidden=true;$('sat-result').textContent='';$('sat-status').textContent='';$('sat-show').disabled=!scenes.length;$('sat-search').disabled=!$('sat-consent').checked;}
 function reset(){remove();scenes=[];$('sat-scenes').innerHTML='<option value="">Busca imágenes primero</option>';$('sat-show').disabled=true;}
 function info(){const d=INDICES[$('sat-index').value];$('sat-formula').textContent=d.formula;$('sat-about').textContent=d.about;}
 function legend(index,display,dates,caption){const list=[...dates].sort();const dateLabel=list.length===1?list[0]:list.length?list[0]+' a '+list.at(-1)+' · fechas por sector':'Cargando';$('sat-map-key').hidden=false;$('sat-map-key').innerHTML=`<b>${esc(index)} · ${esc(dateLabel)}</b><div class="sat-gradient" style="background:linear-gradient(to right,${overlayGradient(index)})"></div><span>${fmt(display.range[0])}<span>${fmt(display.range[1])}</span></span><small>${esc(caption)}<br>${index==='NDVI'?'NDVI fijo: ≤0,20 rojo · ≥0,80 verde.':['EVI','SAVI'].includes(index)?'Escala fija: bajo rojo/naranja → alto verde. Colores orientativos, no clasificación de caña.':display.local?'Contraste local P5–P95.':'Escala fija para comparar sectores.'} Datos: ${indexResolution(index)} m. Vista ${$('sat-smooth').checked&&!VEGETATION_STOPS[index]?'suavizada':'por celdas'}. Gris: sin observación válida.</small>`;}
 async function catalog(bbox,start,end,signal){const q=new URLSearchParams({collections:'sentinel-2-l2a',bbox:bbox.join(','),datetime:start+'T00:00:00Z/'+end+'T23:59:59Z',limit:'100',sortby:'-properties.datetime'});const r=await fetch('https://earth-search.aws.element84.com/v1/search?'+q,{signal});if(!r.ok)throw Error('El catálogo no respondió ('+r.status+').');const d=await r.json();return (d.features||[]).filter(s=>Number(s.properties?.['eo:cloud_cover'])<=Number($('sat-cloud').value)&&s.assets?.scl).sort((a,b)=>b.properties.datetime.localeCompare(a.properties.datetime));}
 function params(){const fs=selected(),start=isoDate($('sat-from').value),end=isoDate($('sat-to').value);if(!$('sat-consent').checked)throw Error('Autoriza la consulta de ubicación para el área seleccionada.');if(!fs.length)throw Error('Selecciona la hacienda y la suerte que deseas consultar.');if(!start||!end||start>end)throw Error('Revisa las fechas de búsqueda.');return {fs,start,end};}
 async function search(){let p;try{p=params();}catch(e){return toast(e.message);}reset();const token=generation;controller=new AbortController();const active=controller,timer=setTimeout(()=>active.abort(),30000);$('sat-search').disabled=true;$('sat-status').textContent='Buscando imágenes para '+scopeLabel()+'…';try{const found=await catalog(featureBounds({type:'FeatureCollection',features:p.fs}),p.start,p.end,active.signal);if(token!==generation)return;scenes=found;const multi=$('sat-scope').value!=='lot';$('sat-scenes').innerHTML=(multi?'<option value="auto">Más reciente disponible por sector</option>':'')+scenes.map((s,i)=>`<option value="${i}">${esc(s.properties.datetime.slice(0,10))} · ${fmt(s.properties['eo:cloud_cover'])}% nubes · ${esc(s.id)}</option>`).join('');if(!scenes.length&&!multi)$('sat-scenes').innerHTML='<option value="">Sin imágenes: amplía fechas o nubosidad</option>';$('sat-show').disabled=!multi&&!scenes.length;$('sat-status').textContent=multi?'El modo por sector busca imágenes para toda el área. Puede combinar fechas; el detalle informa la fecha de cada sector.':`${scenes.length} imágenes entre los 100 resultados más recientes.`;}catch(e){if(token===generation)$('sat-status').textContent=e.name==='AbortError'?'La búsqueda tardó demasiado. Vuelve a intentarlo.':e.message;}finally{clearTimeout(timer);if(token===generation)$('sat-search').disabled=!$('sat-consent').checked;}}
 function render(r){L.imageOverlay(r.maskUrl,[[r.bbox[1],r.bbox[0]],[r.bbox[3],r.bbox[2]]],{pane:'satelliteIndex',interactive:false,opacity:1}).addTo(layer);L.imageOverlay(r.url,[[r.bbox[1],r.bbox[0]],[r.bbox[3],r.bbox[2]]],{pane:'satelliteIndex',interactive:false,opacity:1,className:'satellite-raster',attribution:'Sentinel-2 / Copernicus · Earth Search'}).addTo(layer);}
 function report(){if(!progress)return;const p=progress;$('sat-result').innerHTML=`<b>${esc(p.label)} · ${p.lots} suertes seleccionadas</b><p>${p.done}/${p.total} sectores procesados · ${p.loaded} con imagen (${p.partial} parciales) · ${p.empty} sin píxeles válidos · ${p.failed} con error.</p><p>Gris: sin observación válida. Se conservan los píxeles más recientes y se completan huecos con otras imágenes de hasta 7 días anteriores a la más reciente del sector, posteriores al último corte reportado.</p><details><summary>Fechas y cobertura por sector</summary><ul>${p.items.map(x=>'<li>'+esc(x.id)+' · '+esc(x.date)+' · '+fmt(x.coverage)+'% válido</li>').join('')}</ul></details>${p.lastError?'<small>'+esc(p.lastError)+'</small>':''}`;if(p.loaded)legend(p.index,{range:INDICES[p.index].range,local:false},p.dates,`${p.loaded}/${p.total} sectores · ${p.partial} parciales · ${p.running?'cargando':'finalizado'}`);}
 async function show(){let p;try{p=params();}catch(e){return toast(e.message);}const scope=$('sat-scope').value,choice=$('sat-scenes').value,index=$('sat-index').value,scene=scenes[Number(choice)];if(choice!=='auto'&&!scene)return;remove();document.dispatchEvent(new Event('satellite-start'));const token=generation;running=true;$('sat-stop').hidden=false;$('sat-show').disabled=true;$('sat-search').disabled=true;
  const bbox=featureBounds({type:'FeatureCollection',features:p.fs});map.fitBounds([[bbox[1],bbox[0]],[bbox[3],bbox[2]]],{padding:[30,70],maxZoom:18});$('sat-dropdown').open=false;$('sidebar').classList.remove('open');
  if(scope==='lot'){
   controller=new AbortController();const active=controller,timer=setTimeout(()=>active.abort(),120000);$('sat-status').textContent='Calculando la suerte…';try{const r=await calculateComposite(p.fs[0],[scene,...scenes.filter(s=>s.properties.datetime.slice(0,10)===scene.properties.datetime.slice(0,10))],index,active.signal,{smooth:$('sat-smooth').checked});if(token!==generation)return;render(r);L.geoJSON(p.fs[0],{pane:'satelliteIndex',interactive:false,style:{color:'#fff',weight:3,fill:false}}).addTo(layer);legend(index,r.display,new Set(r.dates),scopeLabel());$('sat-result').innerHTML=`<b>${esc(index)} · ${esc(r.date.slice(0,10))}</b><p>Media ${fmt(r.mean)} · mín. ${fmt(r.min)} · máx. ${fmt(r.max)}</p><p>${fmt(r.coverage)}% del área con datos válidos (aprox.). Resolución de datos: ${r.resolution} m. ${r.smooth?'Vista suavizada':'Celdas originales'}.</p>${cycleStart(p.fs[0])&&r.date.slice(0,10)<=cycleStart(p.fs[0])?'<p>Imagen anterior o del día de inicio del ciclo registrado; no describe el cultivo actual.</p>':!cycleStart(p.fs[0])?'<p>Sin fecha de inicio de ciclo registrada; comprueba la fecha de la imagen.</p>':''}${r.coverage<70?'<p>Cobertura limitada: la media no representa toda la suerte.</p>':''}`;$('sat-status').textContent='Índice visible en la suerte.';}catch(e){if(token===generation){$('sat-status').textContent=e.name==='AbortError'?'Tiempo de descarga agotado. Prueba otra imagen.':e.message;$('sat-dropdown').open=true;}}finally{clearTimeout(timer);if(token===generation){running=false;$('sat-stop').hidden=true;$('sat-show').disabled=false;$('sat-search').disabled=!$('sat-consent').checked;}}return;
  }
  const sectors=makeSectors(p.fs);progress={index,label:scopeLabel(),lots:p.fs.length,total:sectors.length,done:0,loaded:0,partial:0,empty:0,failed:0,dates:new Set(),running:true,lastError:'',items:[]};report();
  while(sectors.length&&token===generation){
   // Prioritize the visible sector nearest to the current center as the user pans.
   const center=map.getCenter(),view=map.getBounds(),vb=[view.getWest(),view.getSouth(),view.getEast(),view.getNorth()];sectors.sort((a,b)=>{const score=s=>(intersects(s.bounds,vb)?0:10000)+Math.hypot((s.bounds[0]+s.bounds[2])/2-center.lng,(s.bounds[1]+s.bounds[3])/2-center.lat);return score(a)-score(b);});const sector=sectors.shift();controller=new AbortController();const active=controller,timer=setTimeout(()=>active.abort(),120000);
   try{const date=scene?.properties.datetime.slice(0,10);const cached=scenes.filter(s=>{const b=s.bbox?.length===4?s.bbox:s.geometry?featureBounds(s):null;return b&&intersects(sector.bounds,b)&&(choice==='auto'||s.properties.datetime.slice(0,10)===date);});const found=await catalog(sector.bounds,choice==='auto'?p.start:date,choice==='auto'?p.end:date,active.signal);
    const candidates=[...new Map([...found,...cached].map(s=>[s.id,s])).values()].sort((a,b)=>b.properties.datetime.localeCompare(a.properties.datetime));
    const result=await calculateComposite({type:'FeatureCollection',features:sector.features},candidates.filter(s=>choice!=='auto'||Date.parse(candidates[0].properties.datetime)-Date.parse(s.properties.datetime)<=7*86400000).slice(0,12),index,active.signal,{currentCycle:choice==='auto',bounds:sector.bounds,fixed:true,smooth:$('sat-smooth').checked});
    if(token!==generation)break;render(result);progress.loaded++;if(result.coverage<99.99)progress.partial++;for(const d of result.dates)progress.dates.add(d);progress.items.push({id:sector.id,date:result.dates.join(' / '),coverage:result.coverage});
   }catch(e){if(token!==generation)break;if(/No hay píxeles válidos/.test(e.message))progress.empty++;else progress.failed++;progress.lastError=e.name==='AbortError'?'Un sector agotó el tiempo de descarga.':e.message;}finally{clearTimeout(timer);}
   if(token!==generation)break;progress.done++;report();$('sat-status').textContent=`Cargando ${progress.done}/${progress.total} sectores. Puedes mover el mapa o detener la carga.`;await new Promise(r=>setTimeout(r,30));
  }
  if(token===generation){running=false;progress.running=false;report();$('sat-stop').hidden=true;$('sat-show').disabled=false;$('sat-search').disabled=!$('sat-consent').checked;$('sat-status').textContent=progress.failed||progress.empty||progress.partial?'Carga finalizada con cobertura parcial. Gris: sin observación válida. Revisa el detalle.':'Carga finalizada.';}
 }
 $('sat-stop').onclick=()=>{abort();if(progress){progress.running=false;report();}$('sat-status').textContent='Carga detenida. Las imágenes calculadas permanecen visibles.';$('sat-show').disabled=false;$('sat-search').disabled=!$('sat-consent').checked;};
 $('sat-remove').onclick=remove;$('sat-search').onclick=search;$('sat-show').onclick=show;
 $('sat-scope').onchange=()=>{syncScope();$('sat-consent').checked=false;reset();};$('sat-hacienda').onchange=()=>{syncScope();reset();};$('sat-lot').onchange=reset;
 $('sat-consent').onchange=()=>{if(!$('sat-consent').checked)reset();$('sat-search').disabled=!$('sat-consent').checked;};
 $('sat-smooth').onchange=remove;
 $('sat-index').onchange=()=>{reset();info();};$('sat-cloud').onchange=$('sat-from').onchange=$('sat-to').onchange=reset;$('sat-scenes').onchange=remove;
 const open=()=>{document.getElementById('close-detail')?.click();$('sidebar').classList.remove('open');$('sat-dropdown').open=true;document.querySelector('.tenencia-key').open=false;};$('open-indices-map').onclick=open;
 $('sat-dropdown').addEventListener('toggle',()=>{if($('sat-dropdown').open)document.querySelector('.tenencia-key').open=false;});L.DomEvent.disableClickPropagation($('sat-dropdown'));L.DomEvent.disableScrollPropagation($('sat-dropdown'));syncScope();info();
 return {open,clear:remove,select:id=>{const f=byId.get(String(id));if(f&&$('sat-scope').value==='lot'&&$('sat-lot').value!==String(id)){$('sat-hacienda').value=String(f.properties.codHacienda);syncScope();$('sat-lot').value=String(id);reset();}}};
}
