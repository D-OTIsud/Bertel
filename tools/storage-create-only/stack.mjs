import { assertCli, command, processContext } from './disposable.mjs';

const action = process.argv[2];
if (!['start', 'stop'].includes(action)) throw new Error('Expected start or stop');
const context = processContext();
assertCli(context);
command('supabase', [action, '--workdir', context.workdir], context, action === 'start' ? 600_000 : 120_000);
console.log(`Owned disposable stack ${action} completed; generated keys withheld.`);
