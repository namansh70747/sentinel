import { redirect } from 'next/navigation';
import { currentIdentity } from '../../lib/auth';
import { NotificationManager } from '../../components/notification-manager';
export const dynamic='force-dynamic';
export default async function NotificationsPage(){if(!(await currentIdentity()))redirect('/login');return <NotificationManager/>;}
