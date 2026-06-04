import { MongoClient, Db, Document } from 'mongodb';
import { requireEnv } from './env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(requireEnv('MONGODB_URI'));
  await client.connect();
  db = client.db();
  return db;
}

export async function getCollection<T extends Document = Document>(name: string) {
  const database = await getDb();
  return database.collection<T>(name);
}
