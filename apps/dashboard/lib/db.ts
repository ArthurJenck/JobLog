import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  db = client.db();
  return db;
}

export async function getCollection<T extends object>(name: string) {
  const database = await getDb();
  return database.collection<T>(name);
}
