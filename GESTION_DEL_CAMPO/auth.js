import {login,restore,authorize,unlockVault,logout,clearSession,identity,isAdmin,recover,recoveryFromURL,changePassword,loginOffline,offlineState,forgetOffline,restoreRememberedOffline,refreshFieldCopy} from './private-api.js';
const $=id=>document.getElementById(id);let opened=false,closing=false,recovery=false,checking=false,lastCheck=0,lastCopy=0,copyPromise=null;
const ONLINE_ONCE='campo-online-open-once';
const channel='BroadcastChannel' in window?new BroadcastChannel('campo-private-access'):null;
const status=msg=>{$('auth-status').textContent=msg;};
const denied=e=>[400,401,403].includes(e.status);
async function closeAccess(message='Sesión cerrada.',broadcast=false){if(closing)return;closing=true;document.documentElement.classList.add('access-locked');try{await window.campoBeforeLock?.();}catch{}if(broadcast)channel?.postMessage({type:'logout'});sessionStorage.removeItem(ONLINE_ONCE);await logout();sessionStorage.setItem('campo-login-message',message);location.replace(new URL('./',location.href).href);}
channel?.addEventListener('message',e=>{if(e.data?.type==='logout')void closeAccess('Sesión cerrada en otra pestaña.');});
function applyRole(){const admin=isAdmin()&&!offlineState();for(const id of ['open-data','harvest-save','harvest-green','harvest-yellow','fuel-open','fuel-editor','budget-calculate']){const el=$(id);if(el){el.hidden=!admin;el.disabled=!admin;}}document.body.dataset.role=identity().rol;
 let connect=$('admin-connect');if(!connect){connect=document.createElement('button');connect.id='admin-connect';connect.className='secondary full mt';connect.textContent='Conectar para actualizar bases';$('open-data').after(connect);connect.onclick=()=>{if(!navigator.onLine){$('offline-status').textContent='Conéctate a internet para actualizar las bases.';return;}if(!window.campoCanReload?.()){$('offline-status').textContent='Finaliza el recorrido o la medición antes de actualizar.';return;}sessionStorage.setItem(ONLINE_ONCE,'1');location.reload();};}
 connect.hidden=!(isAdmin()&&offlineState());
}
async function cacheCopy(){if(copyPromise)return copyPromise;copyPromise=performCacheCopy().finally(()=>{copyPromise=null;});return copyPromise;}
async function performCacheCopy(){
 $('offline-status').textContent='Preparando copia de campo…';
 try{const r=await refreshFieldCopy((n,total)=>$('offline-status').textContent=`Guardando bases ${n}/${total}…`);$('offline-status').textContent='Datos guardados; preparando apertura sin señal…';const reg=await window.campoSW;if(!reg?.active)throw Error('Falta preparar la aplicación para abrir sin señal.');await navigator.storage?.persist?.();$('offline-status').textContent='Datos guardados · '+new Date(r.downloadedAt).toLocaleDateString('es-CO')+' · sin vencimiento';lastCopy=Date.now();return r;}
 catch(e){$('offline-status').textContent='No se completó la actualización; pulsa Preparar para campo con señal.';throw e;}
}
async function openApp(){await unlockVault();$('auth-password').value='';$('auth-panel').hidden=true;$('campo-root').hidden=false;opened=true;$('account-name').textContent=identity().nombre||identity().email;$('account-role').textContent=identity().rol;document.addEventListener('campo-ready',applyRole,{once:true});await import('./app.js');applyRole();}
// An available encrypted field copy opens before any network request.
// A confirmed denial from the server still locks the device on reconnection.
async function check(){if(!opened||closing||checking||!navigator.onLine||document.hidden||Date.now()-lastCheck<300000)return;checking=true;lastCheck=Date.now();try{
 const old=identity()?.rol;await authorize();
 if(identity().rol!==old){await forgetOffline(identity()?.email||'');return await closeAccess('Tus permisos cambiaron. Ingresa para actualizar la copia del equipo.');}
 if(Date.now()-lastCopy>3600000&&window.campoCanReload?.()){
  await cacheCopy();
 }

 }catch(e){if(denied(e)){await forgetOffline(identity()?.email||'').catch(()=>{});await closeAccess('La cuenta o la sesión fue desautorizada. Ingresa con conexión.');}}
 finally{checking=false;}}
$('auth-form').onsubmit=async e=>{e.preventDefault();const b=$('auth-submit');b.disabled=true;status(recovery?'Guardando contraseña…':'Abriendo…');try{
 if(recovery){const p=$('auth-password').value;if(p.length<12)throw Error('Usa una contraseña de al menos 12 caracteres.');await changePassword(p);await logout();recovery=false;$('auth-email').disabled=false;$('auth-submit').textContent='Ingresar';$('auth-password').value='';status('Contraseña actualizada. Ingresa con tu correo y la nueva contraseña.');return;}
 const email=$('auth-email').value.trim(),password=$('auth-password').value;
 if(!navigator.onLine)await loginOffline(email,password);
 else try{await login(email,password,true);}catch(e){if(e.status)throw e;await loginOffline(email,password);}
 await openApp();if(navigator.onLine){if(offlineState())void check();else void cacheCopy().catch(()=>{});}
 }catch(e){if(opened){status(e.message);return;}if(!recovery)clearSession();status(e.status===400?'Revisa el correo y la contraseña.':e.message);}finally{b.disabled=false;}};
$('auth-recover').onclick=async()=>{const email=$('auth-email').value.trim();if(!$('auth-email').checkValidity()||!email)return status('Escribe tu correo para recuperar el acceso.');$('auth-recover').disabled=true;try{await recover(email);status('Si la cuenta puede recibir correos, llegará un enlace para restablecer la contraseña.');}catch{status('No se pudo enviar el correo. Contacta al administrador.');}finally{$('auth-recover').disabled=false;}};
$('account-logout').onclick=()=>void closeAccess('Sesión cerrada.',true);
setInterval(()=>void check(),60000);window.addEventListener('online',()=>void check());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
try{
 const msg=sessionStorage.getItem('campo-login-message');sessionStorage.removeItem('campo-login-message');if(msg)status(msg);
 if(await recoveryFromURL()){recovery=true;$('auth-email').disabled=true;$('auth-email').required=false;$('auth-password').autocomplete='new-password';$('auth-password').minLength=12;$('auth-submit').textContent='Guardar nueva contraseña';status('Escribe tu nueva contraseña (mínimo 12 caracteres).');}
 else{
  const onlineOnce=sessionStorage.getItem(ONLINE_ONCE)==='1';sessionStorage.removeItem(ONLINE_ONCE);let ready=false;
  if(!onlineOnce)try{ready=await restoreRememberedOffline();}catch{/* Missing/incomplete copy: try an existing server session. */}
  if(!ready&&navigator.onLine)try{ready=await restore();}catch(e){if(denied(e))throw e;try{ready=await restoreRememberedOffline();}catch{}if(!ready)throw e;}
  if(!ready&&!navigator.onLine)try{ready=await restoreRememberedOffline();}catch(e){status(e.message);}
  if(ready){await openApp();if(navigator.onLine){if(offlineState())void check();else if(!onlineOnce)void cacheCopy().catch(()=>{});}}
 }
}catch(e){if(denied(e))await logout();status(e.message);}
window.addEventListener('pagehide',()=>document.documentElement.classList.add('access-locked'));
window.addEventListener('pageshow',()=>{if(opened&&!closing){document.documentElement.classList.remove('access-locked');void check();}});
