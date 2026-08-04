import { dbQuery } from '../backend/postgres';
import { AuthService } from '../backend/services/auth';

async function main() {
  try {
    // Try to find a user_id in notifications
    let res = await dbQuery<{ user_id: number }>(`SELECT user_id FROM notifications LIMIT 1`);
    let userId: number | null = null;
    if (res.rows.length > 0) {
      userId = res.rows[0].user_id;
    } else {
      // Fallback: find any parent user
      const r2 = await dbQuery<{ id: number }>(`SELECT id FROM users WHERE role = 'parent' LIMIT 1`);
      if (r2.rows.length > 0) userId = r2.rows[0].id;
    }

    if (!userId) {
      console.error('No parent user found in DB.');
      process.exit(1);
    }

    const tokenPair = await AuthService.createSession(String(userId), 'parent');
    console.log('Found parentId:', userId);
    console.log('Access token:', tokenPair.accessToken);
    console.log('Refresh token:', tokenPair.refreshToken);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();
