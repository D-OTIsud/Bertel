import {pathToFileURL} from 'node:url';

/** Un seul passage à la fois par conteneur ; le verrou SQL couvre les réplicas. */
export async function tickPortalReminders({env=process.env,request=fetch,log=console}={}){
 if(env.NEXT_PUBLIC_ENABLE_DEMO_MODE==='true'||env.PORTAL_REMINDERS_ENABLED==='false'||!env.SUPABASE_SERVICE_ROLE_KEY)return;
 try{
  const response=await request(`http://127.0.0.1:${env.PORT||3000}/api/portal-reminders`,{
   method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(240000),
  });
  if(!response.ok)log.error('[portal-reminders] worker request failed',response.status);
 }catch{log.error('[portal-reminders] worker unavailable; next scheduled run will retry');}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const run=async()=>{await tickPortalReminders();setTimeout(run,15*60*1000);};
 setTimeout(run,60*1000); // attendre le démarrage de Next, sans retarder le serveur
}
