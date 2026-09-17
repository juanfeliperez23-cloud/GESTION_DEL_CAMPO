export function checkShapeZip(buffer){
 const v=new DataView(buffer);if(v.byteLength>40e6||v.byteLength<22)throw Error('ZIP inválido o mayor de 40 MB.');
 let end=-1;for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===v.byteLength){end=i;break;}
 if(end<0)throw Error('No se reconoce el ZIP.');const n=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),size=0;const names=[];
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||n>200||n===65535)throw Error('ZIP dividido, ZIP64 o con demasiados archivos no admitido.');
 for(let i=0;i<n;i++){
  if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw Error('Directorio ZIP inválido.');
  if(v.getUint16(pos+8,true)&1)throw Error('El ZIP no debe tener contraseña.');
  const len=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);size+=v.getUint32(pos+24,true);
  if(size>80e6||pos+46+len+extra+comment>end)throw Error('ZIP demasiado grande o dañado.');
  const name=new TextDecoder().decode(new Uint8Array(buffer,pos+46,len)).toLowerCase();if(name.includes('..')||name.startsWith('/'))throw Error('Ruta ZIP inválida.');names.push(name);pos+=46+len+extra+comment;
 }
 const shapes=names.filter(n=>n.endsWith('.shp')&&!n.startsWith('__macosx/'));if(shapes.length!==1)throw Error('Incluye un solo mapa SHP dentro del ZIP.');
 const stem=shapes[0].slice(0,-4);for(const ext of ['.dbf','.prj','.shx'])if(!names.includes(stem+ext))throw Error('Falta '+ext+' del mismo shapefile.');
 return shapes[0];
}
export async function readMapFile(file){
 if(file.size>40e6)throw Error('Máximo 40 MB.');
 if(!/\.zip$/i.test(file.name))return JSON.parse(await file.text());
 const buffer=await file.arrayBuffer();checkShapeZip(buffer);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./shapefile-worker.js',import.meta.url));const timeout=setTimeout(()=>{worker.terminate();reject(Error('La conversión superó 60 segundos. Revisa el archivo.'));},60000);
  const finish=()=>{clearTimeout(timeout);worker.terminate();};worker.onmessage=({data})=>{finish();if(data.error)reject(Error(data.error));else resolve(data.result);};worker.onerror=()=>{finish();reject(Error('No se pudo convertir el SHP. Comprueba vendor y los archivos del ZIP.'));};worker.postMessage(buffer,[buffer]);
 });
}
