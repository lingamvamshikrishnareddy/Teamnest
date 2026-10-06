import { Redirect } from 'expo-router';
import { useAuth } from '@/providers/auth';

export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === 'signed_in' ? '/home' : '/sign-in'} />;
}
