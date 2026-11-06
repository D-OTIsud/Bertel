import { readFileSync } from 'node:fs';
import { loadListEmailDisposable } from './disposable.mjs';

const local = await loadListEmailDisposable();
local.sql(readFileSync(new URL('../../Base de donnée DLL et API/tests/test_distributed_list_email_intents.sql', import.meta.url), 'utf8'));
console.log('Disposable list-email SQL contract completed; raw output withheld.');
