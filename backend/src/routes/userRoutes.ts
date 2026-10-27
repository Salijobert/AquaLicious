import { Router, Request, Response } from 'express';
import { UserService } from '../services/userService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const users = await UserService.listUsers();
  return res.json(users);
});

router.post('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const { name, username, role, active } = req.body;
  if (!name || !username || !role) {
    return res.status(422).json({ error: 'name, username, and role are required' });
  }

  try {
    const user = await UserService.createUser({ name, username, role, active });
    return res.status(200).json(user);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'User creation failed' });
  }
});

router.patch('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const { id, name, role, active } = req.body;
  if (!id) {
    return res.status(422).json({ error: 'User id is required' });
  }

  try {
    const user = await UserService.updateUser(Number(id), { name, role, active });
    return res.status(200).json(user);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'User update failed' });
  }
});

router.delete('/', authenticate, requireRole(Role.ADMIN), async (req: Request, res: Response) => {
  const id = Number(req.body.id || req.query.id);
  if (!id) {
    return res.status(422).json({ error: 'User id is required' });
  }

  try {
    const result = await UserService.deleteUser(id);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'User deletion failed' });
  }
});

export default router;
