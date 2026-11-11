import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api';

export default async function Home() {
  const session = await getSession();
  redirect(session ? '/panel' : '/login');
}
