import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
        interests: { type: [String], default: [] },
    },
    { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ interests: 1 });

const noteSchema = new Schema(
    {
        ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
    },
    { timestamps: true },
);
noteSchema.index({ ownerId: 1, createdAt: -1 });
noteSchema.index({ createdAt: -1 });

const postSchema = new Schema(
    {
        authorId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
    },
    { timestamps: true },
);
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
export const Note = mongoose.models.Note ?? mongoose.model('Note', noteSchema);
export const Post = mongoose.models.Post ?? mongoose.model('Post', postSchema);
