import {getDb} from '../src/db.js';
const db = await getDb();
const rows = (db as any).prepare('SELECT id, label FROM image_corpus').all() as {id: string, label: string}[];
rows.forEach(r => console.log(r.label));
process.exit(0);
