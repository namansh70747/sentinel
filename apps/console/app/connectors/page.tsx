import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { ConnectorManager } from '../../components/connector-manager';
import { CONNECTORS } from '@sentinel/connectors';
export const dynamic='force-dynamic';
export default async function ConnectorsPage(){
 if(!(await currentIdentity()))redirect('/login');
 return <ConnectorManager planned={CONNECTORS.map(({id,name,category})=>({id,name,category}))}/>;
}
