import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Note, Post, User } from '../server/models';

dotenv.config({ path: process.env.ATLAS_ENV_FILE ?? '.env' });
process.env.MONGO_URI ??= process.env.MONGODB_URI;

const uri = process.env.MONGO_URI;
if (!uri) throw new Error('Set MONGO_URI or MONGODB_URI in the environment file.');

const users = [
    {
        name: 'Demo Admin',
        email: 'admin.demo@example.com',
        role: 'admin' as const,
        interests: ['test 123', 'hulk', 'iron man'],
    },
    {
        name: 'Test User',
        email: 'test.user@example.com',
        role: 'user' as const,
        interests: ['asdahdkal', 'sad', 'red', 'bed', 'ded'],
    },
];

const noteSeeds = [
    { title: 'todo', content: 'buy tea. maybe bread too, forgot again' },
    { title: 'random', content: 'asdahdkal\ntest 123\nsad red bed ded' },
    { title: 'movie??', content: 'hulk was better. iron man also good i guess' },
    { title: 'dont forget', content: 'call back later\nwhich number? not sure' },
    { title: 'ideas', content: 'fix the thing from yesterday. the other thing' },
    { title: 'list', content: 'milk\ncharger\nmaybe socks' },
];

const postSeeds = [
    { title: 'hello', content: 'test 123, just checking if this works' },
    { title: 'movie thought', content: 'hulk, iron man, bed, ded. good list' },
    { title: 'random post', content: 'asdahdkal. typed something so there is a post' },
    { title: 'today', content: 'red folder is somewhere. sad.' },
];

async function main() {
    await mongoose.connect(uri!, { dbName: 'secure-notes' });
    const passwordHash = await bcrypt.hash('demo1234', 12);
    const savedUsers = await Promise.all(
        users.map((user) =>
            User.findOneAndUpdate(
                { email: user.email },
                { $set: { ...user, passwordHash } },
                { new: true, upsert: true, runValidators: true },
            ),
        ),
    );

    const [admin, testUser] = savedUsers;
    await Promise.all(
        noteSeeds.map((note, index) =>
            Note.updateOne(
                { ownerId: testUser._id, title: note.title },
                { $set: { content: note.content } },
                { upsert: true },
            ),
        ),
    );
    await Promise.all(
        postSeeds.map((post, index) =>
            Post.updateOne(
                { authorId: index % 2 === 0 ? testUser._id : admin._id, title: post.title },
                { $set: { content: post.content } },
                { upsert: true },
            ),
        ),
    );

    const [userCount, noteCount, postCount] = await Promise.all([
        User.countDocuments(),
        Note.countDocuments(),
        Post.countDocuments(),
    ]);
    console.log(
        `Demo accounts ready. Database totals: ${userCount} users, ${noteCount} notes, ${postCount} posts.`,
    );
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(error.message ?? error);
    await mongoose.disconnect();
    process.exitCode = 1;
});
