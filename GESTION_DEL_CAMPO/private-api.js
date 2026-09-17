import {operationalData} from './operational-data.js';
import {saveOffline,openOffline,removeOffline,importVault,saveDeviceAccess,removeDeviceAccess,openDeviceAccess} from './offline-cache.js';
// Solo configuración publicable. La autorización real se aplica en Supabase (RLS).
export const SUPABASE_URL='https://hqmbrdifqxdrfptjdqlt.supabase.co';
const API_KEY='sb_publishable_5ToSNq24dkHxqx2jpKIpQw_Pd0iwRr3';
const SESSION='campo-private-session-v1';
const PERSISTENT='campo-remembered-session-v1';
let keepUntil=0;
let session=null,profile=null,vaultKey=null,refreshing=null,vaultHex=null,offline=null;
export const isRemembered=()=>keepUntil>Date.now();
export const rememberedDeadline=()=>keepUntil;
export const identity=()=>profile;
export const offlineState=()=>offline;
export const canHarvest=()=>['administrador','jefe'].includes(profile?.rol);
export const isAdmin=()=>profile?.rol==='administrador';
export const localKey=()=>{if(!vaultKey)throw Error('Sesión bloqueada. Vuelve a ingresar.');return vaultKey;};
export function clearSession(){keepUntil=0;try{localStorage.removeItem(PERSISTENT);}catch{}session=null;profile=null;vaultKey=null;vaultHex=null;offline=null;try{sessionStorage.removeItem(SESSION);}catch{}}
function remember(s){session={access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Date.now()/1000+s.expires_in};sessionStorage.setItem(SESSION,JSON.stringify(session));if(isRemembered())localStorage.setItem(PERSISTENT,JSON.stringify({session,keepUntil}));}
async function request(path,{token,method='GET',body,headers={},timeout=30000}={}){
 const r=await fetch(SUPABASE_URL+path,{method,headers:{apikey:API_KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(timeout)});
 if(!r.ok){let message='';try{const j=await r.json();message=j.msg||j.message||j.error_description||j.error||'';}catch{}const e=Error(message||'No se pudo completar la solicitud ('+r.status+').');e.status=r.status;throw e;}const text=await r.text();return text?JSON.parse(text):null;
}
async function token(){if(!session)throw Error('Inicia sesión.');if(session.expires_at*1000<Date.now()+60000){refreshing??=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(remember).finally(()=>refreshing=null);await refreshing;}return session.access_token;}
export async function login(email,password,keep=false){const result=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});await removeDeviceAccess();localStorage.removeItem(PERSISTENT);keepUntil=keep?Date.now()+15*86400000:0;remember(result);offline=null;return authorize();}
export async function restore(){const p=JSON.parse(localStorage.getItem(PERSISTENT)||'null');if(p){if(p.keepUntil<=Date.now()){await logout();throw Error('La sesión recordada venció. Ingresa nuevamente.');}keepUntil=p.keepUntil;session=p.session;}else{session=JSON.parse(sessionStorage.getItem(SESSION)||'null');}if(!session)return false;await authorize();return true;}
export async function authorize(){const t=await token();const user=await request('/auth/v1/user',{token:t});const rows=await request('/rest/v1/campo_users?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id,nombre,rol,activo',{token:t});if(rows.length!==1||!rows[0].activo){await removeOffline(user.email).catch(()=>{});await removeDeviceAccess();clearSession();const e=Error('Tu cuenta no tiene autorización activa. Contacta al administrador.');e.status=403;throw e;}profile={...rows[0],email:user.email};return profile;}
export async function unlockVault(){if(offline)return;const t=await token(),path='/rest/v1/campo_vault?user_id=eq.'+encodeURIComponent(profile.user_id)+'&select=clave';let rows;
 try{rows=await request(path,{token:t});if(!rows.length){const clave=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');try{await request('/rest/v1/campo_vault',{method:'POST',token:t,body:{user_id:profile.user_id,clave},headers:{Prefer:'return=minimal'}});}catch(e){if(e.status!==409)throw e;}rows=await request(path,{token:t});}}catch(e){throw Error('No se pudo preparar el guardado protegido. Verifica que ejecutaste 02_PROTEGER_REGISTROS_LOCALES.sql. '+e.message);}
 if(!/^[0-9a-f]{64}$/.test(rows[0]?.clave||''))throw Error('Clave de registros no disponible.');vaultHex=rows[0].clave;vaultKey=await importVault(vaultHex);if(isRemembered())await saveDeviceAccess({profile,hex:vaultHex,expires:keepUntil});
}
export async function logout(){const t=session?.access_token;clearSession();await removeDeviceAccess();if(t)try{await request('/auth/v1/logout?scope=local',{method:'POST',token:t,timeout:5000});}catch{}}
export async function recover(email){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(new URL('./',location.href).href),{method:'POST',body:{email}});}
export async function recoveryFromURL(){const p=new URLSearchParams(location.hash.slice(1));if(p.get('error')){history.replaceState(null,'',location.pathname+location.search);throw Error('El enlace ha caducado o no es válido. Solicita otro.');}if(!p.get('access_token'))return false;history.replaceState(null,'',location.pathname+location.search);if(p.get('type')!=='recovery'&&p.get('type')!=='invite')throw Error('Enlace de acceso no compatible. Ingresa con tu correo y contraseña.');remember({access_token:p.get('access_token'),refresh_token:p.get('refresh_token'),expires_in:Number(p.get('expires_in'))||3600});await request('/auth/v1/user',{token:await token()});return true;}
export async function changePassword(password){await request('/auth/v1/user',{method:'PUT',token:await token(),body:{password}});}
const files=new Set(['lotes.json','datos-campo.json','cosecha-base.json','distancias-base.json','lara-base.json']);
export async function privateJSON(name){if(!profile)throw Error('Acceso no autorizado.');if(!files.has(name))throw Error('Archivo no permitido.');if(!canHarvest()&&name==='cosecha-base.json')throw Error('Tu perfil no tiene acceso a la Ruta de sacarosa.');if(offline){if(Date.now()>offline.expires)throw Error('Copia sin conexión vencida.');const cached=offline.files[name];if(!canHarvest()&&name==='datos-campo.json'&&cached?.accessScope!=='operativo-v1')throw Error('Renueva la copia de campo para aplicar los permisos de finca.');return structuredClone(cached);}const remoteName=!canHarvest()&&name==='datos-campo.json'?'datos-operativos.json':name;return request('/storage/v1/object/authenticated/campo-privado/'+remoteName+'?v='+Date.now(),{token:await token(),timeout:120000});}
let loadedStamp;
export function setLoadedStamp(data){loadedStamp=JSON.stringify(data.meta||{});}
export async function publishData(data){await authorize();if(!isAdmin())throw Error('Solo un administrador puede actualizar las bases.');if(!data||data.schema!=='mayaguez-datos-v1')throw Error('Base incompatible.');const fresh=await privateJSON('datos-campo.json');if(loadedStamp!==undefined&&JSON.stringify(fresh.meta||{})!==loadedStamp)throw Error('La base cambió desde que abriste la app. Descarga tu revisión y vuelve a cargar antes de publicar.');const out={...data,local:undefined,meta:{...data.meta,updatedAt:new Date().toISOString(),publishedBy:profile.user_id}};await request('/storage/v1/object/campo-privado/datos-campo.json',{method:'POST',token:await token(),body:out,headers:{'x-upsert':'true','cache-control':'0'},timeout:120000});setLoadedStamp(out);try{await publishOperational(out);}catch(e){throw Error('La base principal se guardó, pero falta actualizar la copia para finca. Pulsa Preparar base para usuarios de finca. '+e.message);}}

export async function loginOffline(email,password){clearSession();const a=await openOffline(email,password);offline=a;profile=a.profile;vaultKey=a.key;vaultHex=a.hex;return profile;}
export async function forgetOffline(email){await removeOffline(email);}
export async function prepareOffline(password,onProgress){if(offline)throw Error('Conéctate e ingresa de nuevo para renovar la descarga.');const current=profile,deadline=keepUntil;await login(current.email,password,isRemembered());if(deadline>Date.now()){keepUntil=deadline;remember(session);}if(profile.user_id!==current.user_id)throw Error('La cuenta cambió. Cierra sesión.');await unlockVault();const bundle={};let n=0;const needed=[...files].filter(name=>canHarvest()||name!=='cosecha-base.json');for(const name of needed){onProgress?.(++n,needed.length);bundle[name]=await privateJSON(name);}return saveOffline({email:profile.email,password,profile,hex:vaultHex,key:vaultKey,files:bundle});}

export async function restoreRememberedOffline(){const p=JSON.parse(localStorage.getItem(PERSISTENT)||'null');if(!p)return false;if(p.keepUntil<=Date.now()){await logout();throw Error('La sesión recordada venció. Ingresa nuevamente.');}const a=await openDeviceAccess();if(!a)return false;keepUntil=p.keepUntil;session=p.session;offline=a;profile=a.profile;vaultKey=a.key;vaultHex=a.hex;return true;}

export async function publishOperational(data){await authorize();if(!isAdmin())throw Error('Solo administrador puede preparar esta base.');const full=data||await privateJSON('datos-campo.json');const result=operationalData(full);await request('/storage/v1/object/campo-privado/datos-operativos.json',{method:'POST',token:await token(),body:result,headers:{'x-upsert':'true','cache-control':'0'},timeout:120000});return result;}

export async function publishMap(data){
 await authorize();if(!isAdmin()||offline)throw Error('Requiere administrador conectado.');
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length)throw Error('Mapa inválido.');
 await request('/storage/v1/object/campo-privado/lotes.json',{method:'POST',token:await token(),body:data,headers:{'x-upsert':'true','cache-control':'0'},timeout:120000});
}
