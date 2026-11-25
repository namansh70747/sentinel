import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { ConnectorManager } from '../../components/connector-manager';
import { CONNECTORS } from '@sentinel/connectors';
export const dynamic='force-dynamic';
export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }){
 if(!(await currentIdentity()))redirect('/login');
 const { workspace } = await searchParams;
 return <ConnectorManager planned={CONNECTORS.map(({id,name,category})=>({id,name,category}))} initialWorkspaceId={workspace}/>;
}
