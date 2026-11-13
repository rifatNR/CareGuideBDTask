import { useEffect, useState } from 'react';
import { request } from './main';

type User = {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'admin';
    interests: string[];
};
type Note = { _id: string; title: string; content: string; ownerId: string };

export default function App() {
    const [user, setUser] = useState<User | null>(null);
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [tab, setTab] = useState('Notes');
    const [notes, setNotes] = useState<Note[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [editing, setEditing] = useState<Note | null>(null);
    const [error, setError] = useState('');

    const refresh = async () => {
        if (!user) return;
        try {
            const result = await request('/notes?page=1&limit=50');
            setNotes(result.items as Note[]);
            if (user.role === 'admin') {
                const all = await request('/admin/users?page=1&limit=100');
                setUsers(all.items as User[]);
            }
        } catch (e: any) {
            setError(e.message);
        }
    };
    useEffect(() => {
        if (user) {
            void refresh();
            return;
        }
        if (localStorage.getItem('token'))
            void request('/auth/me')
                .then((value) => setUser(value as User))
                .catch(() => localStorage.removeItem('token'));
    }, [user]);

    async function auth(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
            const result =
                mode === 'login'
                    ? await request('/auth/login', {
                          method: 'POST',
                          body: JSON.stringify({
                              email: String(data.email),
                              password: String(data.password),
                          }),
                      })
                    : await request('/auth/register', {
                          method: 'POST',
                          body: JSON.stringify({
                              name: String(data.name),
                              email: String(data.email),
                              password: String(data.password),
                              interests: String(data.interests)
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                          }),
                      });
            localStorage.setItem('token', result.token);
            setUser(result.user as User);
        } catch (e: any) {
            setError(e.message);
        }
    }
    async function saveNote(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
            if (editing)
                await request(`/notes/${editing._id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        title: String(data.title),
                        content: String(data.content),
                    }),
                });
            else
                await request('/notes', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: String(data.title),
                        content: String(data.content),
                    }),
                });
            setEditing(null);
            await refresh();
        } catch (e: any) {
            setError(e.message);
        }
    }
    async function loadPosts(id: string) {
        try {
            const result = await request(`/posts/user/${id}?page=1&limit=20`);
            setPosts(result.items);
            setTab('Posts');
        } catch (e: any) {
            setError(e.message);
        }
    }
    async function createUser(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        try {
            await request('/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    name: String(data.name),
                    email: String(data.email),
                    password: String(data.password),
                    role: data.role,
                    interests: String(data.interests)
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                }),
            });
            event.currentTarget.reset();
            await refresh();
        } catch (e: any) {
            setError(e.message);
        }
    }

    if (!user)
        return (
            <main className="auth-page">
                <section className="auth-box">
                    <p className="eyebrow">PRIVATE NOTES</p>
                    <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
                    <p className="muted">A small, secure place for your notes.</p>
                    <form onSubmit={auth} className="stack">
                        {mode === 'register' && (
                            <>
                                <label>
                                    Name
                                    <input name="name" required />
                                </label>
                                <label>
                                    Interests <span className="muted">(comma separated)</span>
                                    <input name="interests" />
                                </label>
                            </>
                        )}
                        <label>
                            Email
                            <input name="email" type="email" required />
                        </label>
                        <label>
                            Password
                            <input name="password" type="password" minLength={8} required />
                        </label>
                        {error && <p className="error">{error}</p>}
                        <button className="primary">
                            {mode === 'login' ? 'Sign in' : 'Register'}
                        </button>
                    </form>
                    <button
                        className="link"
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                    >
                        {mode === 'login' ? 'Create an account' : 'Back to sign in'}
                    </button>
                </section>
            </main>
        );

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setNotes([]);
    };
    const removeNote = async (id: string) => {
        await request(`/notes/${id}`, { method: 'DELETE' });
        await refresh();
    };
    const removeUser = async (id: string) => {
        if (id === user.id) return;
        await request(`/admin/users/${id}`, { method: 'DELETE' });
        await refresh();
    };
    const editUser = async (item: User) => {
        const name = window.prompt('Name', item.name);
        if (name === null) return;
        const email = window.prompt('Email', item.email);
        if (email === null) return;
        const role = window.prompt('Role: user or admin', item.role);
        if (role === null) return;
        const interests = window.prompt('Interests, comma separated', item.interests.join(', '));
        if (interests === null) return;
        if (role !== 'user' && role !== 'admin') {
            setError('Role must be user or admin.');
            return;
        }
        try {
            await request(`/admin/users/${item.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name,
                    email,
                    role,
                    interests: interests
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                }),
            });
            await refresh();
        } catch (e: any) {
            setError(e.message);
        }
    };
    const tabs =
        user.role === 'admin'
            ? ['Notes', 'Users', 'Interests', 'Posts']
            : ['Notes', 'Public posts'];
    return (
        <div className="shell">
            <header className="topbar">
                <a className="brand" href="#">
                    PRIVATE NOTES
                </a>
                <div className="account">
                    <span>
                        {user.name} <small>· {user.role}</small>
                    </span>
                    <button className="link" onClick={logout}>
                        Sign out
                    </button>
                </div>
            </header>
            <div className="layout">
                <aside className="sidebar">
                    <p className="eyebrow">WORKSPACE</p>
                    {tabs.map((item) => (
                        <button
                            key={item}
                            className={`nav-item ${tab === item ? 'active' : ''}`}
                            onClick={async () => {
                                setTab(item);
                                if (item === 'Public posts') {
                                    const r = await request('/posts?page=1&limit=50');
                                    setPosts(r.items);
                                }
                            }}
                        >
                            {item}
                        </button>
                    ))}
                    <div className="side-note">Your notes are private to your account.</div>
                </aside>
                <main className="content">
                    <div className="page-heading">
                        <div>
                            <p className="eyebrow">
                                {user.role === 'admin' ? 'ADMIN CONSOLE' : 'YOUR SPACE'}
                            </p>
                            <h1>{tab}</h1>
                        </div>
                    </div>
                    {error && <p className="error">{error}</p>}
                    {tab === 'Notes' && (
                        <div className="notes-layout">
                            <section>
                                <form className="note-form" onSubmit={saveNote}>
                                    <h2>{editing ? 'Edit note' : 'New note'}</h2>
                                    <label>
                                        Title
                                        <input
                                            name="title"
                                            key={editing?._id ?? 'new-title'}
                                            defaultValue={editing?.title ?? ''}
                                            required
                                        />
                                    </label>
                                    <label>
                                        Note
                                        <textarea
                                            name="content"
                                            rows={7}
                                            key={editing?._id ?? 'new-content'}
                                            defaultValue={editing?.content ?? ''}
                                            required
                                        />
                                    </label>
                                    <div className="actions">
                                        <button className="primary">
                                            {editing ? 'Save changes' : 'Save note'}
                                        </button>
                                        {editing && (
                                            <button
                                                type="button"
                                                className="secondary"
                                                onClick={() => setEditing(null)}
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </section>
                            <section className="note-list">
                                {notes.length === 0 ? (
                                    <p className="muted empty">No notes yet.</p>
                                ) : (
                                    notes.map((note) => (
                                        <article className="note-card" key={note._id}>
                                            <div>
                                                <h2>{note.title}</h2>
                                                <p>{note.content}</p>
                                            </div>
                                            <div className="actions">
                                                <button
                                                    className="link"
                                                    onClick={() => setEditing(note)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="link danger"
                                                    onClick={() => void removeNote(note._id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </article>
                                    ))
                                )}
                            </section>
                        </div>
                    )}
                    {tab === 'Users' && user.role === 'admin' && (
                        <>
                            <form className="user-form" onSubmit={createUser}>
                                <input name="name" placeholder="Name" required />
                                <input name="email" type="email" placeholder="Email" required />
                                <input
                                    name="password"
                                    type="password"
                                    placeholder="Password (8+ chars)"
                                    minLength={8}
                                    required
                                />
                                <input name="interests" placeholder="Interests, comma separated" />
                                <select name="role">
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                                <button className="primary">Add user</button>
                            </form>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Interests</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((item) => (
                                            <tr key={item.id}>
                                                <td>{item.name}</td>
                                                <td>{item.email}</td>
                                                <td>{item.role}</td>
                                                <td>{item.interests.join(', ')}</td>
                                                <td className="actions">
                                                    <button
                                                        className="link"
                                                        onClick={() => void editUser(item)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="link"
                                                        onClick={() => void loadPosts(item.id)}
                                                    >
                                                        View posts
                                                    </button>
                                                    {item.id !== user.id && (
                                                        <button
                                                            className="link danger"
                                                            onClick={() => void removeUser(item.id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    {tab === 'Interests' && user.role === 'admin' && <Interests />}
                    {tab === 'Posts' && <PostList posts={posts} />}
                    {tab === 'Public posts' && (
                        <PublicPosts
                            posts={posts}
                            onCreate={async (title, content) => {
                                await request('/posts', {
                                    method: 'POST',
                                    body: JSON.stringify({ title, content }),
                                });
                                const r = await request('/posts?page=1&limit=50');
                                setPosts(r.items);
                            }}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}

function Interests() {
    const [items, setItems] = useState<any[]>([]);
    useEffect(() => {
        void request('/admin/interests?page=1&limit=100').then(setItems);
    }, []);
    return (
        <div className="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Interest</th>
                        <th>Users</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((row) => (
                        <tr key={row._id}>
                            <td>{row._id}</td>
                            <td>{row.users}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
function PostList({ posts }: { posts: any[] }) {
    return (
        <div className="note-list">
            {posts.length ? (
                posts.map((post) => (
                    <article className="note-card" key={post._id}>
                        <h2>{post.title}</h2>
                        <p>{post.content}</p>
                    </article>
                ))
            ) : (
                <p className="muted">No posts found.</p>
            )}
        </div>
    );
}
function PublicPosts({
    posts,
    onCreate,
}: {
    posts: any[];
    onCreate: (title: string, content: string) => Promise<void>;
}) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    return (
        <div className="notes-layout">
            <form
                className="note-form"
                onSubmit={async (e) => {
                    e.preventDefault();
                    await onCreate(title, content);
                    setTitle('');
                    setContent('');
                }}
            >
                <h2>Write a public post</h2>
                <label>
                    Title
                    <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </label>
                <label>
                    Post
                    <textarea
                        rows={7}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        required
                    />
                </label>
                <button className="primary">Publish</button>
            </form>
            <PostList posts={posts} />
        </div>
    );
}
