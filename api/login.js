// Vercel serverless function: POST /api/login
// Validates HR portal credentials. Override defaults via ADMIN_USER / ADMIN_PASS
// environment variables in the Vercel dashboard.
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }

  const expectedUser = process.env.ADMIN_USER || 'bpcl_hr';
  const expectedPass = process.env.ADMIN_PASS || 'EnergisingLives2026';

  if (username === expectedUser && password === expectedPass) {
    return res.status(200).json({
      success: true,
      token: 'bpcl-session-' + Math.random().toString(36).substring(2, 10)
    });
  }

  return res.status(401).send('Invalid username or password');
}
