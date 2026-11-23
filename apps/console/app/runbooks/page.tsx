import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { RunbookManager } from '../../components/runbook-manager';
export const dynamic='force-dynamic';
export default async function RunbooksPage(){if(!(await currentIdentity()))redirect('/login');return <RunbookManager/>;}
