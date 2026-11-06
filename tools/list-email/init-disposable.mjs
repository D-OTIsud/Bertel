import { initializeListEmailDisposable, prepareListEmailDisposable, verifyStartedListEmailDisposable } from './disposable.mjs';

const mode = process.argv.slice(2);
if (mode.length === 0) await initializeListEmailDisposable();
else if (mode.length === 1 && mode[0] === '--prepare') prepareListEmailDisposable();
else if (mode.length === 1 && mode[0] === '--verify-start') verifyStartedListEmailDisposable();
else throw new Error('Expected no option, --prepare, or --verify-start');
console.log('Disposable list-email CI ownership phase completed; raw output and keys withheld.');
