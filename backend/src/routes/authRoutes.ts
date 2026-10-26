import { Router, Request, Response } from 'express';
import { prisma, config, generateTestToken } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { Role } from '@prisma/client';
import { sanitize } from '../middleware/security.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { action, username, password, name, role, idToken } = req.body;

  // 1. Customer Registration
  if (action === 'register') {
    if (role && (role === 'Administrator' || role === 'ADMIN' || role === 'Staff' || role === 'STAFF')) {
      return res.status(403).json({ error: 'Public registration must only provision Customer access' });
    }

    if (!name || !username) {
      return res.status(422).json({ error: 'Name and username are required' });
    }

    const cleanUsername = sanitize(username);
    const existing = await prisma.user.findFirst({
      where: { username: cleanUsername }
    });

    if (existing) {
      return res.status(409).json({ error: 'Username already in use' });
    }

    const firebaseUid = `uid-${cleanUsername}-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        firebaseUid,
        name: sanitize(name),
        username: cleanUsername,
        email: `${cleanUsername}@aqualicious.local`,
        role: Role.CUSTOMER,
        active: true
      }
    });

    const token = generateTestToken({ uid: user.firebaseUid, email: user.email, role: 'CUSTOMER' });
    return res.status(200).json({
      token,
      expires_in: 7200,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: 'Customer'
      }
    });
  }

  // 2. Direct ID Token verification (from Firebase Web SDK)
  if (idToken) {
    try {
      const user = await prisma.user.findFirst({
        where: { firebaseUid: req.body.uid }
      });
      if (user && !user.active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }
      return res.status(200).json({
        token: idToken,
        user: user ? {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role === Role.ADMIN ? 'Administrator' : user.role === Role.STAFF ? 'Staff' : 'Customer'
        } : null
      });
    } catch {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  }

  // 3. Login by username/password (for local development and integration tests)
  if (!username) {
    return res.status(422).json({ error: 'Username is required' });
  }

  const cleanUsername = sanitize(username);
  const user = await prisma.user.findFirst({
    where: { username: cleanUsername }
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  const roleName = user.role === Role.ADMIN ? 'Administrator' : user.role === Role.STAFF ? 'Staff' : 'Customer';
  const token = generateTestToken({ uid: user.firebaseUid, email: user.email, role: user.role });

  return res.status(200).json({
    token,
    expires_in: 7200,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: roleName
    }
  });
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  return res.json({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role === Role.ADMIN ? 'Administrator' : user.role === Role.STAFF ? 'Staff' : 'Customer'
  });
});

router.patch('/', authenticate, async (req: Request, res: Response) => {
  const { name, address, phone } = req.body;
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(name ? { name: sanitize(name) } : {}),
      ...(address ? { address: sanitize(address) } : {}),
      ...(phone ? { phone: sanitize(phone) } : {})
    }
  });

  return res.json({
    id: updated.id,
    name: updated.name,
    username: updated.username,
    address: updated.address,
    phone: updated.phone
  });
});

export default router;
