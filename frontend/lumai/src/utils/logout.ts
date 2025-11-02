import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

const LOGOUT_REDIRECT_PATH = '/';

export async function logoutUser(redirect: boolean = true): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore sign-out errors, user will be forced to re-auth
  } finally {
    if (redirect && typeof window !== 'undefined') {
      window.location.assign(LOGOUT_REDIRECT_PATH);
    }
  }
}
