import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tickPortalReminders} from './portal-reminder-worker.mjs';
test('le worker reste inactif sans clé ou en mode démonstration',async()=>{
 let calls=0;const request=async()=>{calls++;};
 await tickPortalReminders({env:{},request});await tickPortalReminders({env:{SUPABASE_SERVICE_ROLE_KEY:'key',NEXT_PUBLIC_ENABLE_DEMO_MODE:'true'},request});
 assert.equal(calls,0);
});
test('la clé serveur reste dans un en-tête vers la boucle locale',async()=>{
 let observed;
 await tickPortalReminders({env:{SUPABASE_SERVICE_ROLE_KEY:'key',PORT:'3100'},request:async(...args)=>{observed=args;return{ok:true};}});
 assert.equal(observed[0],'http://127.0.0.1:3100/api/portal-reminders');assert.equal(observed[1].headers.Authorization,'Bearer key');
});
