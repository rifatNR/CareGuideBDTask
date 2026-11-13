import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Note, Post, User } from './models';

type Claims = { userId: string; role: 'user' | 'admin' };
type AuthRequest = Request & { user?: Claims };

const pageSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
const publicUser = (user: any) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    interests: user.interests,
    createdAt: user.createdAt,
});
const asyncRoute =
    (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);

async function requireUser(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Sign in required.' });
    try {
        const claims = jwt.verify(token, process.env.JWT_SECRET!) as Claims;
        const user = (await User.findById(claims.userId).select('_id role').lean()) as any;
        if (!user) return res.status(401).json({ message: 'Account not found.' });
        req.user = { userId: String(user._id), role: user.role };
        next();
    } catch {
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.user?.role !== 'admin')
        return res.status(403).json({ message: 'Admin access required.' });
    next();
}

function parse(schema: z.ZodTypeAny, value: unknown) {
    const result = schema.safeParse(value);
    if (!result.success) {
        const error = new Error(
            result.error.issues.map((issue) => issue.message).join(', '),
        ) as Error & { status?: number };
        error.status = 400;
        throw error;
    }
    return result.data;
}

function makeToken(user: any) {
    return jwt.sign({ userId: String(user._id), role: user.role }, process.env.JWT_SECRET!, {
        expiresIn: '7d',
    });
}

export const apiRouter = Router();

apiRouter.post(
    '/auth/register',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({
                name: z.string().trim().min(1).max(80),
                email: z.string().email(),
                password: z.string().min(8),
                interests: z.array(z.string().trim().min(1)).max(20).default([]),
            }),
            req.body,
        );
        const email = input.email.toLowerCase();
        if (await User.exists({ email }))
            return res.status(409).json({ message: 'Email is already registered.' });
        const user = await User.create({
            ...input,
            email,
            passwordHash: await bcrypt.hash(input.password, 12),
        });
        res.status(201).json({ token: makeToken(user), user: publicUser(user) });
    }),
);

apiRouter.post(
    '/auth/login',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({ email: z.string().email(), password: z.string() }),
            req.body,
        );
        const user = await User.findOne({ email: input.email.toLowerCase() }).select(
            '+passwordHash',
        );
        if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
            return res.status(401).json({ message: 'Email or password is incorrect.' });
        }
        res.json({ token: makeToken(user), user: publicUser(user) });
    }),
);

apiRouter.get(
    '/posts',
    asyncRoute(async (req, res) => {
        const { page, limit } = parse(pageSchema, req.query);
        const [items, total] = await Promise.all([
            Post.find()
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Post.countDocuments(),
        ]);
        res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    }),
);
apiRouter.get(
    '/posts/user/:userId',
    asyncRoute(async (req, res) => {
        const userId = String(req.params.userId);
        if (!mongoose.isValidObjectId(userId))
            return res.status(400).json({ message: 'Invalid user ID.' });
        const { page, limit } = parse(pageSchema, req.query);
        const result = await User.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: 'posts',
                    localField: '_id',
                    foreignField: 'authorId',
                    pipeline: [
                        {
                            $facet: {
                                items: [
                                    { $sort: { createdAt: -1 } },
                                    { $skip: (page - 1) * limit },
                                    { $limit: limit },
                                ],
                                total: [{ $count: 'count' }],
                            },
                        },
                    ],
                    as: 'posts',
                },
            },
            { $project: { _id: 0, posts: 1 } },
        ]);
        const postPage = result[0]?.posts[0] ?? { items: [], total: [] };
        const total = postPage.total[0]?.count ?? 0;
        res.json({
            items: postPage.items,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    }),
);

apiRouter.use(requireUser);
apiRouter.get(
    '/auth/me',
    asyncRoute(async (req, res) => {
        const user = await User.findById(req.user!.userId);
        res.json(publicUser(user));
    }),
);

apiRouter.get(
    '/notes',
    asyncRoute(async (req, res) => {
        const { page, limit } = parse(pageSchema, req.query);
        const filter = req.user!.role === 'admin' ? {} : { ownerId: req.user!.userId };
        const [items, total] = await Promise.all([
            Note.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Note.countDocuments(filter),
        ]);
        res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    }),
);
apiRouter.get(
    '/notes/:id',
    asyncRoute(async (req, res) => {
        const filter: any = { _id: req.params.id };
        if (req.user!.role !== 'admin') filter.ownerId = req.user!.userId;
        const note = await Note.findOne(filter).lean();
        if (!note) return res.status(404).json({ message: 'Note not found.' });
        res.json(note);
    }),
);
apiRouter.post(
    '/notes',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({ title: z.string().trim().min(1).max(160), content: z.string().min(1) }),
            req.body,
        );
        res.status(201).json(await Note.create({ ...input, ownerId: req.user!.userId }));
    }),
);
apiRouter.patch(
    '/notes/:id',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({ title: z.string().trim().min(1).max(160), content: z.string().min(1) }),
            req.body,
        );
        const filter: any = { _id: req.params.id };
        if (req.user!.role !== 'admin') filter.ownerId = req.user!.userId;
        const note = await Note.findOneAndUpdate(filter, input, { new: true, runValidators: true });
        if (!note) return res.status(404).json({ message: 'Note not found.' });
        res.json(note);
    }),
);
apiRouter.delete(
    '/notes/:id',
    asyncRoute(async (req, res) => {
        const filter: any = { _id: req.params.id };
        if (req.user!.role !== 'admin') filter.ownerId = req.user!.userId;
        const note = await Note.findOneAndDelete(filter);
        if (!note) return res.status(404).json({ message: 'Note not found.' });
        res.json({ success: true });
    }),
);

apiRouter.use('/admin', requireAdmin);
apiRouter.get(
    '/admin/users',
    asyncRoute(async (req, res) => {
        const { page, limit } = parse(pageSchema, req.query);
        const [users, total] = await Promise.all([
            User.find()
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(),
        ]);
        res.json({
            items: users.map(publicUser),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    }),
);
apiRouter.post(
    '/admin/users',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({
                name: z.string().trim().min(1).max(80),
                email: z.string().email(),
                password: z.string().min(8),
                role: z.enum(['user', 'admin']),
                interests: z.array(z.string().trim().min(1)).max(20).default([]),
            }),
            req.body,
        );
        const user = await User.create({
            ...input,
            email: input.email.toLowerCase(),
            passwordHash: await bcrypt.hash(input.password, 12),
        });
        res.status(201).json(publicUser(user));
    }),
);
apiRouter.patch(
    '/admin/users/:id',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({
                name: z.string().trim().min(1).max(80),
                email: z.string().email(),
                role: z.enum(['user', 'admin']),
                interests: z.array(z.string().trim().min(1)).max(20),
            }),
            req.body,
        );
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { ...input, email: input.email.toLowerCase() },
            { new: true, runValidators: true },
        );
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json(publicUser(user));
    }),
);
apiRouter.delete(
    '/admin/users/:id',
    asyncRoute(async (req, res) => {
        if (req.user!.userId === req.params.id)
            return res.status(400).json({ message: 'You cannot delete your own account.' });
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        await Promise.all([
            Note.deleteMany({ ownerId: req.params.id }),
            Post.deleteMany({ authorId: req.params.id }),
        ]);
        res.json({ success: true });
    }),
);
apiRouter.get(
    '/admin/interests',
    asyncRoute(async (req, res) => {
        const { page, limit } = parse(pageSchema, req.query);
        const items = await User.aggregate([
            { $match: { interests: { $exists: true } } },
            { $unwind: '$interests' },
            { $group: { _id: '$interests', users: { $sum: 1 } } },
            { $sort: { _id: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
        ]);
        res.json(items);
    }),
);

apiRouter.post(
    '/posts',
    asyncRoute(async (req, res) => {
        const input = parse(
            z.object({ title: z.string().trim().min(1).max(160), content: z.string().min(1) }),
            req.body,
        );
        res.status(201).json(await Post.create({ ...input, authorId: req.user!.userId }));
    }),
);
export function errorHandler(error: any, _req: Request, res: Response, _next: NextFunction) {
    if (error?.code === 11000)
        return res.status(409).json({ message: 'Email is already registered.' });
    const status = error.status ?? 500;
    res.status(status).json({ message: status === 500 ? 'Something went wrong.' : error.message });
}
