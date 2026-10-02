import { MongoClient, Db, type ClientSession, type Document } from 'mongodb';
import { requireEnv } from './env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const mongoClient = await getMongoClient();
  db = mongoClient.db();
  return db;
}

export async function getMongoClient() {
  if (client) return client;
  client = new MongoClient(requireEnv('MONGODB_URI'));
  await client.connect();
  return client;
}

export async function withMongoTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const mongoClient = await getMongoClient();
  return mongoClient.withSession((session) => session.withTransaction(() => work(session)));
}

export async function getCollection<T extends Document = Document>(name: string) {
  const database = await getDb();
  return database.collection<T>(name);
}
